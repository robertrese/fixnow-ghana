"use strict";

(() => {
  const GHANA_CENTER = { lat: 7.9465, lng: -1.0232 };
  const GHANA_BOUNDS = { north: 11.2, south: 4.5, east: 1.4, west: -3.4 };
  let initializePromise = null;
  let googleLoadPromise = null;
  let locationPickerPromise = null;
  let responderMapPromise = null;
  let map = null;
  let responderMap = null;
  let clusterer = null;
  let currentLocationMarker = null;
  let currentLocationCoordinates = null;
  let reportMarkers = [];
  let responderMarkers = [];

  function elements() {
    return {
      canvas: document.querySelector("#nearbyMap"),
      unavailable: document.querySelector("#nearbyMapUnavailable"),
      toolbar: document.querySelector("#nearbyMapToolbar"),
      search: document.querySelector("#nearbyPlaceSearch"),
      locate: document.querySelector("#nearbyLocateBtn"),
      status: document.querySelector("#nearbyMapStatus")
    };
  }

  function showUnavailable(message, detail) {
    const ui = elements();
    if (!ui.unavailable) return;
    ui.canvas.hidden = true;
    ui.toolbar.hidden = true;
    ui.status.hidden = true;
    ui.unavailable.hidden = false;
    ui.unavailable.querySelector("strong").textContent = message;
    ui.unavailable.querySelector("p").textContent = detail;
    window.dispatchEvent(new CustomEvent("fixnow:map-unavailable", { detail: { message } }));
  }

  function announce(message) {
    const status = elements().status;
    status.textContent = message;
    status.hidden = false;
  }

  function loadGoogleMaps(config) {
    if (window.google?.maps?.importLibrary) return Promise.resolve();
    if (googleLoadPromise) return googleLoadPromise;
    googleLoadPromise = new Promise((resolve, reject) => {
      const callback = `fixNowGoogleMapsReady_${Date.now()}`;
      const timeout = window.setTimeout(() => reject(new Error("Google Maps timed out")), 15000);
      window[callback] = () => {
        window.clearTimeout(timeout);
        delete window[callback];
        resolve();
      };
      window.gm_authFailure = () => {
        window.clearTimeout(timeout);
        reject(new Error("Google Maps authentication failed"));
      };
      const script = document.createElement("script");
      const params = new URLSearchParams({
        key: config.browserKey,
        v: config.apiVersion || "weekly",
        loading: "async",
        callback,
        libraries: "maps,marker,places,geocoding"
      });
      script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
      script.async = true;
      script.onerror = () => reject(new Error("Google Maps could not be downloaded"));
      document.head.appendChild(script);
    }).catch((error) => {
      googleLoadPromise = null;
      throw error;
    });
    return googleLoadPromise;
  }

  async function reverseGeocode(position) {
    const { Geocoder } = await google.maps.importLibrary("geocoding");
    const response = await new Geocoder().geocode({ location: position });
    return response.results?.[0]?.formatted_address || "Selected point in Ghana";
  }

  async function loadBoundaries(apiBase) {
    const response = await fetch(`${apiBase}/api/public/boundaries/geojson`, { headers: { Accept: "application/json" } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok || !payload.geojson) throw new Error(payload.error || "MMDA boundaries are unavailable");
    map.data.addGeoJson(payload.geojson);
    map.data.setStyle({
      fillColor: "#1f8a5b",
      fillOpacity: 0.035,
      strokeColor: "#245642",
      strokeOpacity: 0.48,
      strokeWeight: 1
    });
    return payload.boundaryVersion;
  }

  async function addCurrentLocation(position) {
    const { AdvancedMarkerElement, PinElement } = await google.maps.importLibrary("marker");
    if (currentLocationMarker) currentLocationMarker.map = null;
    const pin = new PinElement({ background: "#ffffff", borderColor: "#0a7a52", glyphColor: "#0a7a52", glyphText: "YOU", scale: 1.1 });
    currentLocationMarker = new AdvancedMarkerElement({
      map,
      position,
      title: "Your current location, visible only on this device",
      gmpClickable: true
    });
    currentLocationMarker.append(pin);
    currentLocationCoordinates = position;
    window.dispatchEvent(new CustomEvent("fixnow:location-updated", { detail: { ...position } }));
    map.panTo(position);
    map.setZoom(15);
    const address = await reverseGeocode(position).catch(() => "Current location captured");
    announce(`${address}. This precise preview stays on your device until you explicitly add it to a report.`);
  }

  function requestCurrentLocation() {
    if (!navigator.geolocation) {
      announce("Location services are not available on this device. Search or enter the location manually in a report.");
      return;
    }
    announce("Waiting for location permission...");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => addCurrentLocation({ lat: coords.latitude, lng: coords.longitude }),
      () => announce("Location permission was denied or unavailable. Search and manual reporting still work."),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }

  async function addPlaceSearch() {
    const { PlaceAutocompleteElement } = await google.maps.importLibrary("places");
    const host = elements().search;
    host.replaceChildren();
    const autocomplete = new PlaceAutocompleteElement({});
    autocomplete.placeholder = "Search road, landmark, or place";
    autocomplete.includedRegionCodes = ["gh"];
    autocomplete.setAttribute("aria-label", "Search for a road, landmark, locality, or place in Ghana");
    autocomplete.addEventListener("gmp-select", async (event) => {
      const place = event.placePrediction?.toPlace();
      if (!place) return;
      await place.fetchFields({ fields: ["displayName", "formattedAddress", "location", "id"] });
      if (!place.location) return announce("That place has no map location. Try another search.");
      map.panTo(place.location);
      map.setZoom(16);
      announce(`${place.displayName || place.formattedAddress || "Place selected"}. Review the map before adding a location to a report.`);
    });
    host.appendChild(autocomplete);
  }

  async function initialize({ apiBase }) {
    const ui = elements();
    if (!ui.canvas) return;
    if (!navigator.onLine) {
      showUnavailable("Live map unavailable offline.", "Manual location entry, GhanaPostGPS, GPS capture, and queued reporting remain available.");
      return;
    }
    const response = await fetch(`${apiBase}/api/public/config`, { headers: { Accept: "application/json" } });
    const payload = await response.json().catch(() => ({}));
    const config = payload.maps || {};
    if (!response.ok || !payload.ok || !config.enabled) {
      console.info("FixNow: the live map needs a restricted Google Maps browser key and production Map ID on the server.");
      showUnavailable("The map is not available yet.", "Every verified report is still in the list. You can report a problem by describing the place or entering a GhanaPostGPS address.");
      return;
    }
    if (!window.markerClusterer?.MarkerClusterer) throw new Error("The pinned marker clustering library is unavailable");
    await loadGoogleMaps(config);
    const { Map } = await google.maps.importLibrary("maps");
    const { AdvancedMarkerElement, PinElement } = await google.maps.importLibrary("marker");
    map = new Map(ui.canvas, {
      center: GHANA_CENTER,
      zoom: 7,
      mapId: config.mapId,
      restriction: { latLngBounds: GHANA_BOUNDS, strictBounds: false },
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      clickableIcons: true,
      gestureHandling: "greedy"
    });
    clusterer = new markerClusterer.MarkerClusterer({
      map,
      markers: [],
      renderer: {
        render({ count, position }) {
          const pin = new PinElement({
            glyphText: String(count),
            background: "#173c2f",
            borderColor: "#ffffff",
            glyphColor: "#ffffff",
            scale: 1.25
          });
          const marker = new AdvancedMarkerElement({
            position,
            title: `Cluster of ${count} verified public reports`,
            gmpClickable: true,
            zIndex: 1000 + count
          });
          marker.append(pin);
          return marker;
        }
      }
    });
    await addPlaceSearch();
    const boundaryVersion = await loadBoundaries(apiBase);
    ui.canvas.hidden = false;
    ui.toolbar.hidden = false;
    ui.unavailable.hidden = true;
    ui.locate.addEventListener("click", requestCurrentLocation);
    announce(`Live Ghana map ready with official MMDA boundaries (${boundaryVersion}). No moderated public reports are available yet.`);
    window.dispatchEvent(new CustomEvent("fixnow:map-ready"));
  }

  function initializeNearby(options) {
    if (!initializePromise) {
      initializePromise = initialize(options).catch((error) => {
        initializePromise = null;
        // Residents never see the browser's raw error ("Failed to fetch", "TypeError"); developers find it in the console.
        console.info("FixNow: the live map could not load.", error);
        showUnavailable("The map could not load.", "Every verified report is still in the list. You can report a problem by describing the place or entering a GhanaPostGPS address.");
      });
    }
    return initializePromise;
  }

  async function createLocationPicker({ apiBase, onSelect }) {
    const canvas = document.querySelector("#reportLocationMap");
    const searchHost = document.querySelector("#reportPlaceSearch");
    const unavailable = document.querySelector("#reportMapUnavailable");
    const status = document.querySelector("#locationVerification");
    if (!canvas || !searchHost || !unavailable) return;

    const showPickerUnavailable = (message) => {
      canvas.hidden = true;
      searchHost.hidden = true;
      unavailable.hidden = false;
      unavailable.textContent = message;
    };
    if (!navigator.onLine) {
      showPickerUnavailable("Map search is unavailable offline. Enter a community or landmark, GhanaPostGPS address, or saved coordinates instead.");
      return;
    }

    const response = await fetch(`${apiBase}/api/public/config`, { headers: { Accept: "application/json" } });
    const payload = await response.json().catch(() => ({}));
    const config = payload.maps || {};
    if (!response.ok || !payload.ok || !config.enabled) {
      showPickerUnavailable("The map is not available yet. Describe the place below, use your GPS location, or enter a GhanaPostGPS address.");
      return;
    }

    await loadGoogleMaps(config);
    const { Map } = await google.maps.importLibrary("maps");
    const { AdvancedMarkerElement, PinElement } = await google.maps.importLibrary("marker");
    const { PlaceAutocompleteElement } = await google.maps.importLibrary("places");
    const pickerMap = new Map(canvas, {
      center: GHANA_CENTER,
      zoom: 7,
      mapId: config.mapId,
      restriction: { latLngBounds: GHANA_BOUNDS, strictBounds: true },
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      clickableIcons: true,
      gestureHandling: "cooperative"
    });
    let pickerMarker = null;

    const selectPoint = async (position, source, placeId = "", suppliedAddress = "") => {
      const lat = Number(typeof position.lat === "function" ? position.lat() : position.lat);
      const lng = Number(typeof position.lng === "function" ? position.lng() : position.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const point = { lat, lng };
      if (!pickerMarker) {
        const pin = new PinElement({ background: "#ffffff", borderColor: "#0a7a52", glyphColor: "#0a7a52", glyphText: "+", scale: 1.12 });
        pickerMarker = new AdvancedMarkerElement({
          map: pickerMap,
          position: point,
          title: "Selected private report location. Drag to adjust.",
          gmpClickable: true,
          gmpDraggable: true
        });
        pickerMarker.append(pin);
        pickerMarker.addListener("dragend", () => selectPoint(pickerMarker.position, "map-drag"));
      } else {
        pickerMarker.position = point;
      }
      pickerMap.panTo(point);
      if ((pickerMap.getZoom() || 0) < 15) pickerMap.setZoom(15);
      status.textContent = "Checking the selected point against official Ghana MMDA boundaries...";
      const address = suppliedAddress || await reverseGeocode(point).catch(() => "Selected point in Ghana");
      onSelect?.({ latitude: lat, longitude: lng, source, placeId, address });
    };

    pickerMap.addListener("click", (event) => {
      if (event.latLng) selectPoint(event.latLng, "map-click");
    });

    searchHost.replaceChildren();
    const autocomplete = new PlaceAutocompleteElement({});
    autocomplete.placeholder = "Search road, landmark, or place";
    autocomplete.includedRegionCodes = ["gh"];
    autocomplete.setAttribute("aria-label", "Search for a report location in Ghana");
    autocomplete.addEventListener("gmp-select", async (event) => {
      const place = event.placePrediction?.toPlace();
      if (!place) return;
      await place.fetchFields({ fields: ["displayName", "formattedAddress", "location", "id"] });
      if (!place.location) {
        status.textContent = "That search result has no map point. Try another place or enter the location manually.";
        return;
      }
      await selectPoint(place.location, "place-search", place.id || "", place.formattedAddress || place.displayName || "");
    });
    searchHost.appendChild(autocomplete);
    searchHost.hidden = false;
    canvas.hidden = false;
    unavailable.hidden = true;
  }

  // Plain sentences for residents: the raw error never reaches the screen.
  const PICKER_FAILED_MESSAGE = "The map could not load. Type the community and a landmark below, use your GPS location, or enter a GhanaPostGPS address.";
  const PICKER_DEMO_MESSAGE = "The map is switched off in the demo. Type the community and a landmark below.";

  function initializeLocationPicker(options) {
    if (options && options.demo) {
      // The public demo has no server, so it never asks for the map configuration.
      const unavailable = document.querySelector("#reportMapUnavailable");
      const canvas = document.querySelector("#reportLocationMap");
      const search = document.querySelector("#reportPlaceSearch");
      if (canvas) canvas.hidden = true;
      if (search) search.hidden = true;
      if (unavailable) { unavailable.hidden = false; unavailable.textContent = PICKER_DEMO_MESSAGE; }
      return Promise.resolve();
    }
    if (!locationPickerPromise) {
      locationPickerPromise = createLocationPicker(options).catch((error) => {
        locationPickerPromise = null;
        const unavailable = document.querySelector("#reportMapUnavailable");
        const canvas = document.querySelector("#reportLocationMap");
        const search = document.querySelector("#reportPlaceSearch");
        if (canvas) canvas.hidden = true;
        if (search) search.hidden = true;
        console.info("FixNow: map search could not load.", error);
        if (unavailable) {
          unavailable.hidden = false;
          unavailable.textContent = PICKER_FAILED_MESSAGE;
        }
      });
    }
    return locationPickerPromise;
  }

  async function setPublicReports(reports) {
    if (!map || !clusterer) return;
    const { AdvancedMarkerElement, PinElement } = await google.maps.importLibrary("marker");
    reportMarkers.forEach((marker) => { marker.map = null; });
    reportMarkers = (Array.isArray(reports) ? reports : []).flatMap((report) => {
      const latitude = Number(report.publicLatitude);
      const longitude = Number(report.publicLongitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
      const title = `${report.category || "Community report"}: ${report.title || "Verified report"}, approximate location ${report.publicLocationLabel || "protected"}`;
      const statusBorders = { Open: "#ce3840", Acknowledged: "#e8aa17", "In Progress": "#2368aa", Resolved: "#0a7a52" };
      const pin = new PinElement({ glyphText: String(report.categoryGlyph || "!").slice(0, 3), background: "#ffffff", borderColor: statusBorders[report.status] || "#173c2f", glyphColor: "#173c2f" });
      const marker = new AdvancedMarkerElement({ position: { lat: latitude, lng: longitude }, title, gmpClickable: true });
      const wrapper = document.createElement("span");
      wrapper.className = "fixnow-map-marker";
      wrapper.append(pin);
      const verified = document.createElement("span");
      verified.className = "fixnow-map-verified";
      verified.textContent = "V";
      verified.setAttribute("aria-hidden", "true");
      wrapper.append(verified);
      marker.append(wrapper);
      marker.fixNowReportId = report.id;
      marker.addEventListener("gmp-click", () => {
        window.dispatchEvent(new CustomEvent("fixnow:map-report-selected", { detail: { reportId: report.id } }));
      });
      return [marker];
    });
    clusterer.clearMarkers();
    clusterer.addMarkers(reportMarkers);
  }

  function focusPublicReport(reportId) {
    const marker = reportMarkers.find((candidate) => candidate.fixNowReportId === reportId);
    if (!marker || !map) return false;
    map.panTo(marker.position);
    if ((map.getZoom() || 0) < 12) map.setZoom(12);
    return true;
  }

  function showResponderMapUnavailable(message) {
    const canvas = document.querySelector("#responderMap");
    const unavailable = document.querySelector("#responderMapUnavailable");
    if (canvas) canvas.hidden = true;
    if (unavailable) {
      unavailable.hidden = false;
      unavailable.querySelector("strong").textContent = "Responder map unavailable";
      unavailable.querySelector("p").textContent = message;
    }
  }

  async function setResponderReports(reports) {
    if (!responderMap) return;
    const { AdvancedMarkerElement, PinElement } = await google.maps.importLibrary("marker");
    responderMarkers.forEach((marker) => { marker.map = null; });
    responderMarkers = (Array.isArray(reports) ? reports : []).flatMap((report) => {
      if (!report?._responderAuthorized) return [];
      const latitude = Number(report.location?.exactLatitude);
      const longitude = Number(report.location?.exactLongitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
      const pin = new PinElement({
        glyphText: String(report.categoryGlyph || report.type || "!").slice(0, 1).toUpperCase(),
        background: report.operations?.overdue ? "#ce3840" : "#ffffff",
        borderColor: report.operations?.overdue ? "#8c1f27" : "#173c2f",
        glyphColor: report.operations?.overdue ? "#ffffff" : "#173c2f"
      });
      const marker = new AdvancedMarkerElement({
        map: responderMap,
        position: { lat: latitude, lng: longitude },
        title: `${report.id}: ${report.type || "case"}, exact authorised field location`,
        gmpClickable: true
      });
      marker.append(pin);
      marker.addEventListener("gmp-click", () => window.dispatchEvent(new CustomEvent("fixnow:responder-report-selected", { detail: { reportId: report.id } })));
      return [marker];
    });
    if (responderMarkers.length) {
      const bounds = new google.maps.LatLngBounds();
      responderMarkers.forEach((marker) => bounds.extend(marker.position));
      responderMap.fitBounds(bounds, 52);
      if (responderMarkers.length === 1) responderMap.setZoom(15);
    }
  }

  async function createResponderMap({ apiBase, reports, token }) {
    const canvas = document.querySelector("#responderMap");
    const unavailable = document.querySelector("#responderMapUnavailable");
    if (!canvas || !unavailable || !token) return showResponderMapUnavailable("Authenticated responder access is required. Exact locations remain hidden.");
    if (!navigator.onLine) return showResponderMapUnavailable("The live map is offline. Previously authorised case details remain available in list mode.");
    const response = await fetch(`${apiBase}/api/public/config`, { headers: { Accept: "application/json" } });
    const payload = await response.json().catch(() => ({}));
    const config = payload.maps || {};
    if (!response.ok || !payload.ok || !config.enabled) return showResponderMapUnavailable("A restricted Google Maps browser key and production Map ID have not been configured. Exact authorised locations remain available in list mode.");
    await loadGoogleMaps(config);
    const { Map } = await google.maps.importLibrary("maps");
    responderMap = new Map(canvas, {
      center: GHANA_CENTER,
      zoom: 7,
      mapId: config.mapId,
      restriction: { latLngBounds: GHANA_BOUNDS, strictBounds: false },
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      clickableIcons: false,
      gestureHandling: "cooperative"
    });
    canvas.hidden = false;
    unavailable.hidden = true;
    await setResponderReports(reports);
  }

  function initializeResponder(options) {
    if (!responderMapPromise) {
      responderMapPromise = createResponderMap(options).catch((error) => {
        responderMapPromise = null;
        showResponderMapUnavailable(`${String(error.message || "Map could not load")}. Exact authorised locations remain available in list mode.`);
      });
    } else {
      responderMapPromise.then(() => setResponderReports(options.reports)).catch(() => {});
    }
    return responderMapPromise;
  }

  window.FixNowMaps = { initializeNearby, initializeLocationPicker, initializeResponder, setPublicReports, setResponderReports, focusPublicReport, getCurrentLocation: () => currentLocationCoordinates };
})();
