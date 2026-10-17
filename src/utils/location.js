const norm = (s) => (s ?? "").trim().toLowerCase();

const hasCoords = (loc) => typeof loc?.lat === "number" && typeof loc?.lng === "number";

export function distanceKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const NEARBY_KM = 50;

/**
 * How close a feed is to the viewer.
 * tier 0 = same city (or within 50 km), 1 = same state, 2 = same country, 3 = elsewhere, 4 = unknown.
 */
export function proximity(viewer, target) {
  if (!viewer || !target) return { tier: 4, label: null, distanceKm: null };

  const km = hasCoords(viewer) && hasCoords(target) ? distanceKm(viewer, target) : null;
  const rounded = km === null ? null : Math.round(km);

  if ((norm(viewer.city) && norm(viewer.city) === norm(target.city)) || (km !== null && km <= NEARBY_KM)) {
    return { tier: 0, label: "city", distanceKm: rounded };
  }
  if (norm(viewer.state) && norm(viewer.state) === norm(target.state)) {
    return { tier: 1, label: "state", distanceKm: rounded };
  }
  if (norm(viewer.country) && norm(viewer.country) === norm(target.country)) {
    return { tier: 2, label: "country", distanceKm: rounded };
  }
  return { tier: target.city || target.state || hasCoords(target) ? 3 : 4, label: null, distanceKm: rounded };
}

/** Validate and clean a location payload. Returns { value } or { error }. */
export function parseLocation(body, { requireCity = true } = {}) {
  if (!body || typeof body !== "object") return { error: "Location is required" };
  const str = (v) => (typeof v === "string" ? v.trim().slice(0, 80) : undefined);
  const num = (v) => (v === undefined || v === null || v === "" ? undefined : Number(v));

  const value = {
    city: str(body.city),
    state: str(body.state),
    country: str(body.country) || "India",
    lat: num(body.lat),
    lng: num(body.lng),
    source: body.source === "gps" ? "gps" : "manual",
  };

  if (requireCity && !value.city) return { error: "City is required" };
  if (value.lat !== undefined && !(value.lat >= -90 && value.lat <= 90)) return { error: "Invalid latitude" };
  if (value.lng !== undefined && !(value.lng >= -180 && value.lng <= 180)) return { error: "Invalid longitude" };
  if ((value.lat === undefined) !== (value.lng === undefined)) return { error: "Latitude and longitude go together" };

  for (const k of Object.keys(value)) if (value[k] === undefined) delete value[k];
  return { value };
}
