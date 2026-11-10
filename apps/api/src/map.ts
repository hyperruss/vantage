const defaultZone = [
  [52.296, 104.270], [52.298, 104.295], [52.291, 104.320],
  [52.275, 104.319], [52.267, 104.295], [52.272, 104.269],
];

function readZone() {
  if (!process.env.MAP_ZONE) return defaultZone;
  const zone: unknown = JSON.parse(process.env.MAP_ZONE);
  if (!Array.isArray(zone) || zone.length < 3 || !zone.every((point) =>
    Array.isArray(point) && point.length === 2
    && typeof point[0] === "number" && Math.abs(point[0]) <= 85
    && typeof point[1] === "number" && Math.abs(point[1]) <= 180)) {
    throw new Error("MAP_ZONE must contain at least three [latitude, longitude] pairs");
  }
  return zone as number[][];
}

export const mapConfig = {
  tileUrl: process.env.MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: process.env.MAP_TILE_ATTRIBUTION || "© OpenStreetMap",
  attributionUrl: process.env.MAP_TILE_ATTRIBUTION_URL || "https://www.openstreetmap.org/copyright",
  zone: readZone(),
};

export const zonePolygon = `(${mapConfig.zone.map(([lat, lng]) => `(${lng},${lat})`).join(",")})`;
