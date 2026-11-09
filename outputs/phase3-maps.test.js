"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "fixnow-ghana.html"), "utf8");
const maps = fs.readFileSync(path.join(__dirname, "map-foundation.js"), "utf8");
const worker = fs.readFileSync(path.join(__dirname, "service-worker.js"), "utf8");
const backend = fs.readFileSync(path.join(__dirname, "..", "work", "fixnow-backend", "server.js"), "utf8");
const environment = fs.readFileSync(path.join(__dirname, "..", "work", "fixnow-backend", ".env.example"), "utf8");

assert.doesNotThrow(() => new Function(maps), "map foundation script should parse");
assert(html.includes('id="nearbyMapUnavailable"'), "the map needs an honest unavailable state");
assert(html.includes('aria-label="Verified public reports map of Ghana"'), "the map surface needs an accessible name");
assert(maps.includes('google.maps.importLibrary("marker")'), "maps must use the current marker library");
assert(maps.includes("AdvancedMarkerElement"), "maps must use AdvancedMarkerElement");
assert(maps.includes("PlaceAutocompleteElement"), "maps must use Places API New autocomplete");
assert(maps.includes("includedRegionCodes = [\"gh\"]"), "place search must be restricted to Ghana");
assert(maps.includes("markerClusterer.MarkerClusterer"), "maps must use the pinned official marker clusterer");
assert(maps.includes("/api/public/boundaries/geojson"), "maps must load authoritative backend boundaries");
assert(maps.includes("reverseGeocode"), "the current-location preview must support reverse geocoding");
assert(maps.includes("gmpClickable: true") && maps.includes("title:"), "interactive markers need keyboard support and accessible titles");
assert(!maps.includes("new google.maps.Marker"), "deprecated google.maps.Marker must not be used");
assert(!maps.includes("HeatmapLayer") && !maps.includes("KmlLayer"), "discontinued or deprecated map drawing layers must not be used");
assert(backend.includes("GOOGLE_MAPS_BROWSER_KEY") && backend.includes("GOOGLE_MAP_ID"), "map configuration must come from the environment");
assert(!backend.includes("GOOGLE_MAPS_SERVER_GEOCODING_KEY ="), "the current browser config must not read or expose a server geocoding key");
assert(environment.includes("GOOGLE_MAPS_SERVER_GEOCODING_KEY=") && environment.includes("GOOGLE_MAPS_ANDROID_KEY=") && environment.includes("GOOGLE_MAPS_IOS_KEY="), "separate key placeholders must be documented");
assert(worker.includes("url.origin !== self.location.origin"), "the service worker must bypass all cross-origin Google map resources");
assert(worker.includes("markerclusterer-2.6.2.min.js"), "the pinned local clusterer should be available offline");

console.log("Phase 3 Google Maps foundation test passed");
