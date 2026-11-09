"use strict";

const fs = require("fs");
const crypto = require("crypto");

const REGION_CODES = new Map([
  ["Western", "01"],
  ["Central", "02"],
  ["Greater Accra", "03"],
  ["Volta", "04"],
  ["Eastern", "05"],
  ["Ashanti", "06"],
  ["Western North", "07"],
  ["Ahafo", "08"],
  ["Bono", "09"],
  ["Bono East", "10"],
  ["Oti", "11"],
  ["Northern", "12"],
  ["Savannah", "13"],
  ["North East", "14"],
  ["Upper East", "15"],
  ["Upper West", "16"]
]);

function stableMmdaId(region, district, version) {
  const digest = crypto.createHash("sha256").update(`${version}\n${region}\n${district}`).digest("hex").slice(0, 16);
  return `gss-mmda-${digest}`;
}

function joinArcIndexes(indexes, decodedArcs) {
  const points = [];
  for (const index of indexes) {
    const source = index >= 0 ? decodedArcs[index] : decodedArcs[~index].slice().reverse();
    if (points.length && source.length) points.pop();
    points.push(...source);
  }
  return points;
}

function decodeGeometry(geometry, decodedArcs) {
  if (geometry.type === "Polygon") {
    return [geometry.arcs.map((ring) => joinArcIndexes(ring, decodedArcs))];
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.arcs.map((polygon) => polygon.map((ring) => joinArcIndexes(ring, decodedArcs)));
  }
  throw new Error(`Unsupported boundary geometry: ${geometry.type}`);
}

function ringContains(point, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [x, y] = ring[index];
    const [previousX, previousY] = ring[previous];
    const crosses = (y > point[1]) !== (previousY > point[1]);
    if (crosses && point[0] < ((previousX - x) * (point[1] - y)) / (previousY - y) + x) inside = !inside;
  }
  return inside;
}

function polygonContains(point, rings) {
  if (!rings.length || !ringContains(point, rings[0])) return false;
  return !rings.slice(1).some((hole) => ringContains(point, hole));
}

function polygonBounds(polygons) {
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const [longitude, latitude] of ring) {
        bounds[0] = Math.min(bounds[0], longitude);
        bounds[1] = Math.min(bounds[1], latitude);
        bounds[2] = Math.max(bounds[2], longitude);
        bounds[3] = Math.max(bounds[3], latitude);
      }
    }
  }
  return bounds;
}

function ringAreaAndCentroid(ring) {
  let twiceArea = 0;
  let longitudeSum = 0;
  let latitudeSum = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [longitude, latitude] = ring[index];
    const [nextLongitude, nextLatitude] = ring[index + 1];
    const cross = longitude * nextLatitude - nextLongitude * latitude;
    twiceArea += cross;
    longitudeSum += (longitude + nextLongitude) * cross;
    latitudeSum += (latitude + nextLatitude) * cross;
  }
  if (Math.abs(twiceArea) < Number.EPSILON) return { area: 0, point: ring[Math.floor(ring.length / 2)] };
  return {
    area: Math.abs(twiceArea / 2),
    point: [longitudeSum / (3 * twiceArea), latitudeSum / (3 * twiceArea)]
  };
}

function representativePoint(polygons, bounds) {
  const candidates = polygons
    .map((polygon) => ({ polygon, ...ringAreaAndCentroid(polygon[0]) }))
    .sort((left, right) => right.area - left.area);
  for (const candidate of candidates) {
    if (polygonContains(candidate.point, candidate.polygon)) return candidate.point;
  }
  const boundsCenter = [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];
  const containing = polygons.find((polygon) => polygonContains(boundsCenter, polygon));
  if (containing) return boundsCenter;
  return candidates[0]?.polygon[0][Math.floor(candidates[0].polygon[0].length / 2)] || boundsCenter;
}

function canonicalLabel(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/\barea\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function createBoundaryIndex(filePath, metadata) {
  const topology = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (topology.type !== "Topology" || !topology.transform) throw new Error("Boundary file must be quantized TopoJSON");
  const [scaleX, scaleY] = topology.transform.scale;
  const [translateX, translateY] = topology.transform.translate;
  const decodedArcs = topology.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([deltaX, deltaY]) => {
      x += deltaX;
      y += deltaY;
      return [x * scaleX + translateX, y * scaleY + translateY];
    });
  });
  const collection = Object.values(topology.objects).find((object) => object.type === "GeometryCollection");
  if (!collection) throw new Error("Boundary topology has no geometry collection");
  const version = metadata.version;
  const boundaries = collection.geometries.map((geometry) => {
    const region = String(geometry.properties?.Region || "").trim();
    const district = String(geometry.properties?.District || geometry.properties?.Label || "").trim();
    if (!region || !district || !REGION_CODES.has(region)) throw new Error("Boundary is missing an official region or district label");
    const polygons = decodeGeometry(geometry, decodedArcs);
    const bounds = polygonBounds(polygons);
    return {
      region,
      district,
      regionId: `gss-region-${REGION_CODES.get(region)}`,
      mmdaId: stableMmdaId(region, district, version),
      polygons,
      bounds,
      publicPoint: representativePoint(polygons, bounds)
    };
  });
  if (boundaries.length !== 261) throw new Error(`Expected 261 MMDA boundaries, received ${boundaries.length}`);
  let cachedGeoJson = null;

  return {
    metadata: { ...metadata, featureCount: boundaries.length },
    toGeoJson() {
      if (cachedGeoJson) return cachedGeoJson;
      cachedGeoJson = {
        type: "FeatureCollection",
        features: boundaries.map((boundary) => ({
          type: "Feature",
          id: boundary.mmdaId,
          properties: {
            region: boundary.region,
            district: boundary.district,
            regionId: boundary.regionId,
            mmdaId: boundary.mmdaId,
            boundaryVersion: version
          },
          geometry: {
            type: boundary.polygons.length === 1 ? "Polygon" : "MultiPolygon",
            coordinates: boundary.polygons.length === 1 ? boundary.polygons[0] : boundary.polygons
          }
        }))
      };
      return cachedGeoJson;
    },
    findByLabels(region, district) {
      const regionLabel = canonicalLabel(region);
      const districtLabel = canonicalLabel(district);
      const boundary = boundaries.find((candidate) =>
        canonicalLabel(candidate.region) === regionLabel && canonicalLabel(candidate.district) === districtLabel
      );
      if (!boundary) return null;
      return {
        region: boundary.region,
        district: boundary.district,
        regionId: boundary.regionId,
        mmdaId: boundary.mmdaId,
        publicLatitude: Number(boundary.publicPoint[1].toFixed(5)),
        publicLongitude: Number(boundary.publicPoint[0].toFixed(5)),
        boundaryVersion: version
      };
    },
    publicPoint(mmdaId) {
      const boundary = boundaries.find((candidate) => candidate.mmdaId === mmdaId);
      if (!boundary) return null;
      return {
        latitude: Number(boundary.publicPoint[1].toFixed(5)),
        longitude: Number(boundary.publicPoint[0].toFixed(5))
      };
    },
    find(latitude, longitude) {
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
      const point = [longitude, latitude];
      const boundary = boundaries.find((candidate) =>
        longitude >= candidate.bounds[0] && latitude >= candidate.bounds[1] &&
        longitude <= candidate.bounds[2] && latitude <= candidate.bounds[3] &&
        candidate.polygons.some((polygon) => polygonContains(point, polygon))
      );
      if (!boundary) return null;
      return {
        region: boundary.region,
        district: boundary.district,
        regionId: boundary.regionId,
        mmdaId: boundary.mmdaId,
        publicLatitude: Number(boundary.publicPoint[1].toFixed(5)),
        publicLongitude: Number(boundary.publicPoint[0].toFixed(5)),
        boundaryVersion: version
      };
    }
  };
}

module.exports = { createBoundaryIndex, stableMmdaId };
