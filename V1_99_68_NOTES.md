# V1.99.68 - Maps (only www/horizon_maps.js and www/horizon_maps.css changed)

- Coordinates in any common shape now resolve without a place search: (-33.9158, 18.6121), lat/lon labels, 33.9158 S 18.6121 E, trailing "(my location)".
- Place search: Photon first, then OSM Nominatim as a backup (never used for type-ahead).
- AI tools lock in the position: "here" and plain coordinates are reverse-named (Photon reverse, then Nominatim reverse) and the tool result carries a LOCKED POSITIONS block with exact lat,lon plus the area name. The AI is told to say it in one line and reuse the coordinates in later tags.
- GPS navigation is untouched: area naming only runs inside the AI tools.
- In-chat map card: 86% width (max 330px), 310px tall.
- Not run on a device from the build sandbox (no network). Public servers can still rate-limit.
