# Google Maps Production Setup

FixNow does not include credentials. With no configured browser key and Map ID, the app deliberately shows a map-unavailable state while preserving GPS capture, GhanaPostGPS, manual location, tracking, and offline report queues.

## Browser map

1. Create a dedicated Google Cloud project for the production web app.
2. Enable Maps JavaScript API and Places API (New).
3. Create a production Map ID for the JavaScript vector map.
4. Create a browser key restricted to the exact production HTTPS origins, such as `https://app.fixnowghana.org/*`.
5. Restrict that key to Maps JavaScript API and Places API (New).
6. Set `GOOGLE_MAPS_BROWSER_KEY` and `GOOGLE_MAP_ID` in the backend secret/environment manager.
7. Do not put the server, Android, or iOS key in either value.

The browser key is delivered to the approved web client by `/api/public/config`; its safety depends on strict website and API restrictions. Google recommends a separate key for each application type: <https://developers.google.com/maps/api-security-best-practices>

## Server and native separation

- `GOOGLE_MAPS_SERVER_GEOCODING_KEY`: reserve for backend-only Geocoding API calls. Store in a secret manager and restrict by server IP plus API. It is never returned by public configuration.
- `GOOGLE_MAPS_ANDROID_KEY`: reserve for a future native Maps SDK build. Restrict by Android package and signing-certificate SHA-1.
- `GOOGLE_MAPS_IOS_KEY`: reserve for a future native Maps SDK build. Restrict by iOS bundle identifier.

The current Android wrapper uses the web map over the secure app-asset origin; it does not consume the reserved Android key.

## Quotas and operations

Set conservative daily and per-minute quotas independently for Maps JavaScript API and Places API (New). Configure Cloud Billing budget alerts, quota alerts at 50%, 75%, and 90%, and an incident contact. Review usage by credential weekly during the pilot. Do not raise a quota until traffic and billing have been reviewed.

Use separate development and production Cloud projects, keys, Map IDs, quotas, and allowed origins. Never permit `*` referrers, unrestricted IPs, or all APIs. Rotate a key only after checking legitimate usage and deploying its replacement.

## Runtime verification

After configuration, open Nearby and verify:

- The map identifies itself as Google Maps and renders Ghana.
- Search suggestions are restricted to Ghana.
- The 261 GSS MMDA boundaries load from FixNow's backend.
- Current location is requested only after pressing My location.
- Denied permission leaves search and manual reporting usable.
- Browser developer tools show no server/native key.
- The service worker stores no Google map scripts, tiles, Places responses, or geocoding responses.
