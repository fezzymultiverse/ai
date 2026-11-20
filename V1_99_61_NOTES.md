# Horizon V1.99.61 - MAPS (keyless, in-app)

Includes everything in V1.99.60. Nothing removed.

## What it does
- Ask for directions: a live map card appears in the chat (route line, A/B pins, distance, time, turn-by-turn list).
- Mode pills on the card: Car, Walk, Bike, Transit, Taxi. Tap one and the route is recalculated in place.
- Maps tile (Apps dock + Apps menu): full screen map, place search with suggestions, long-press the map to drop a destination, My location, Fit route, recent routes, AI maps ON/OFF switch.
- AI tags: [[map.route: from | to | mode]] (from may be "here"), [[map.show: place]], [[map.near: what | place or here]], [[map.here: now]].

## Keyless stack (no key, no account, nothing opens another app)
- Engine: Leaflet 1.9.4, loaded at runtime (unpkg, then jsDelivr, then cdnjs).
- Tiles: OpenStreetMap standard tiles (CARTO now requires an API key and paints 'API KEY REQUIRED' on tiles). Dark themes invert them with CSS.
- Routing: FOSSGIS OSRM (routed-car / routed-bike / routed-foot), falls back to the OSM Valhalla server.
- Search: Photon, falls back to Nominatim. Stops: Overpass. Position: the shared HzGeo helper.

## Honest limits
- TRANSIT HAS NO TIMETABLES. No keyless worldwide timetable source exists. Transit = walk to the nearest stop found in OpenStreetMap, a road-time ride estimate to the stop nearest the destination, walk on. If no stops exist near both ends it says so and shows the road route.
- Taxi = road route only. No fare, no booking.
- Walk and bike times are computed from distance (5 and 15 km/h).
- Map cards in the chat are not saved with the chat: reopening a chat does not redraw them. Recent routes in the Maps app are saved on the device.
- Needs internet. Public servers have fair-use limits and can change; the failover chain exists for that.

## NOT verified
No endpoint was called live (no network in the build sandbox). Logic was tested with node (polyline decode, step text, distance/time formatting, tag parsing, wiring checks). Test on the phone: "directions from here to <place> by walking".
