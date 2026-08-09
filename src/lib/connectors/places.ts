import { fetch } from "@tauri-apps/plugin-http";
import { getApiKey } from "@/lib/db/queries";

export interface PlaceResult {
  placeId: string;
  name: string;
  address: string;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  location: { lat: number; lng: number } | null;
}

const PLACE_FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.rating,places.userRatingCount,places.websiteUri,places.location";

const MAX_RADIUS_METERS = 50_000;

/** Great-circle distance in miles — used to turn Text Search's locationBias (a hint,
 * not a hard restriction — results can and do fall outside it) into an effective
 * restriction, and to detect when a tile has saturated its 20-result cap. */
function distanceMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

async function requireGoogleKey(): Promise<string> {
  const key = await getApiKey("google_places");
  if (!key) {
    throw new Error("No Google Places key. Add one in Connectors.");
  }
  return key;
}

async function geocodeGoogle(
  location: string,
  key: string,
): Promise<{ lat: number; lng: number }> {
  const params = new URLSearchParams({ address: location, key });
  const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`, {
    method: "GET",
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Geocoding error ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    status: string;
    results?: { geometry?: { location?: { lat: number; lng: number } } }[];
  };
  const point = data.results?.[0]?.geometry?.location;
  if (data.status !== "OK" || !point) {
    throw new Error(`Could not find "${location}" (${data.status}).`);
  }
  return { lat: point.lat, lng: point.lng };
}

export async function geocodeNominatim(location: string): Promise<{ lat: number; lng: number }> {
  const params = new URLSearchParams({ q: location, format: "jsonv2", limit: "1" });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    method: "GET",
    headers: {
      "User-Agent": "VantagePoint/0.1 (contact: local desktop app; +https://vantagepoint.local)",
    },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenStreetMap error ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = (await res.json()) as { lat?: string; lon?: string }[];
  const first = data[0];
  if (!first?.lat || !first?.lon) {
    throw new Error(`Could not find "${location}" via OpenStreetMap.`);
  }
  return { lat: Number(first.lat), lng: Number(first.lon) };
}

/** Geocodes free-text (e.g. "Dallas, TX") into a lat/lng center point. Tries Google, then
 * falls back to free OpenStreetMap/Nominatim (no key required) — so geocoding works even
 * without a Google Places key, though the Places business-search below still does. */
export async function geocodeLocation(location: string): Promise<{ lat: number; lng: number }> {
  const googleKey = await getApiKey("google_places");
  if (googleKey) {
    try {
      return await geocodeGoogle(location, googleKey);
    } catch {
      // fall through to the next provider
    }
  }

  try {
    return await geocodeNominatim(location);
  } catch (err) {
    throw new Error(
      `Could not geocode "${location}". ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
}

/** Text-searches Google Places, biased to a circle around the geocoded location. */
export async function searchPlacesText(
  query: string,
  center: { lat: number; lng: number },
  radiusMiles: number,
  maxResults: number,
): Promise<PlaceResult[]> {
  const key = await requireGoogleKey();
  const radiusMeters = Math.min(radiusMiles * 1609.34, MAX_RADIUS_METERS);

  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": PLACE_FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery: query,
      locationBias: {
        circle: {
          center: { latitude: center.lat, longitude: center.lng },
          radius: radiusMeters,
        },
      },
      maxResultCount: Math.min(Math.max(maxResults, 1), 20),
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Google Places error ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    places?: {
      id?: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      nationalPhoneNumber?: string;
      rating?: number;
      userRatingCount?: number;
      websiteUri?: string;
      location?: { latitude: number; longitude: number };
    }[];
  };
  return (data.places ?? [])
    .filter((p) => p.id)
    .map((p) => ({
      placeId: p.id!,
      name: p.displayName?.text ?? "",
      address: p.formattedAddress ?? "",
      phone: p.nationalPhoneNumber ?? null,
      website: p.websiteUri ?? null,
      rating: p.rating ?? null,
      reviewCount: p.userRatingCount ?? null,
      location: p.location ? { lat: p.location.latitude, lng: p.location.longitude } : null,
    }))
    .slice(0, maxResults);
}

const PLACE_RESULT_CAP = 20; // Places API (New) hard cap per call, both Text and Nearby Search.

/** ~sqrt(3): spaces hex-packed circles with minimal gaps and modest overlap so a grid
 * of tiles covers a territory without holes. Alternating row offset by half a spacing
 * unit approximates a hex grid without needing true axial hex-grid math. */
const TILE_SPACING_FACTOR = 1.7;

function milesToLatDegrees(miles: number): number {
  return miles / 69.0;
}
function milesToLngDegrees(miles: number, atLat: number): number {
  return miles / (69.0 * Math.max(0.01, Math.cos((atLat * Math.PI) / 180)));
}

interface SweepCell {
  center: { lat: number; lng: number };
  radiusMiles: number;
  depth: number;
}

/** Lays a grid of overlapping circular tiles across a territory. Tiles near the edge
 * whose center falls slightly outside the territory are still included — coverage
 * favors slight over-search at the boundary over leaving a gap. */
function tileTerritory(
  center: { lat: number; lng: number },
  radiusMiles: number,
  tileRadiusMiles: number,
): SweepCell[] {
  const spacing = tileRadiusMiles * TILE_SPACING_FACTOR;
  const cells: SweepCell[] = [];
  const rows = Math.ceil((radiusMiles + tileRadiusMiles) / spacing);
  for (let row = -rows; row <= rows; row++) {
    const rowOffsetMiles = row % 2 === 0 ? 0 : spacing / 2;
    const y = row * spacing;
    const cols = Math.ceil((radiusMiles + tileRadiusMiles) / spacing) + 1;
    for (let col = -cols; col <= cols; col++) {
      const x = col * spacing + rowOffsetMiles;
      const distFromCenter = Math.sqrt(x * x + y * y);
      if (distFromCenter > radiusMiles + tileRadiusMiles) continue;
      const lat = center.lat + milesToLatDegrees(y);
      const lng = center.lng + milesToLngDegrees(x, center.lat);
      cells.push({ center: { lat, lng }, radiusMiles: tileRadiusMiles, depth: 0 });
    }
  }
  return cells.length > 0 ? cells : [{ center, radiusMiles, depth: 0 }];
}

export interface SweepResult {
  places: PlaceResult[];
  callsMade: number;
  /** True only if no tile saturated its 20-result cap without being fully subdivided —
   * i.e. every dense pocket in the territory was broken down until it stopped hitting
   * the cap. False means the budget ran out first: the roster is a lower bound, not a
   * verified-complete count. */
  complete: boolean;
  saturatedUnexpandedCells: number;
}

/** Sweeps a territory for every matching business via tiled Places Text Search calls,
 * recursively subdividing any tile that saturates the 20-result cap (a strong signal
 * there are more businesses in that spot than one call can return) until tiles stop
 * saturating or a hard call budget is hit. Text Search (not Nearby Search) is used
 * deliberately to keep the existing free-text business-type query working — Nearby
 * Search restricts you to Google's canonical place-type enum, which the current UI's
 * "type anything" search box doesn't map to. The tradeoff: locationBias is a hint, not
 * a hard restriction, so results are post-filtered by actual distance (via the newly
 * requested `places.location` field) to enforce the radius ourselves. */
export async function sweepPlacesText(
  query: string,
  center: { lat: number; lng: number },
  radiusMiles: number,
  maxPlacesCalls: number,
): Promise<SweepResult> {
  const MAX_DEPTH = 4;
  const FLOOR_RADIUS_MILES = 0.25;
  const startTileRadius = Math.min(radiusMiles, 5);

  const queue: SweepCell[] =
    radiusMiles <= startTileRadius
      ? [{ center, radiusMiles, depth: 0 }]
      : tileTerritory(center, radiusMiles, startTileRadius);

  const byId = new Map<string, PlaceResult>();
  let callsMade = 0;
  let saturatedUnexpandedCells = 0;
  let budgetExhausted = false;

  while (queue.length > 0) {
    const cell = queue.shift()!;
    if (callsMade >= maxPlacesCalls) {
      budgetExhausted = true;
      saturatedUnexpandedCells += 1;
      continue;
    }
    let raw: PlaceResult[];
    try {
      raw = await searchPlacesText(query, cell.center, cell.radiusMiles, PLACE_RESULT_CAP);
    } catch {
      continue; // one bad tile shouldn't abort the whole sweep
    }
    callsMade += 1;

    const inRange = raw.filter((p) => {
      if (!p.location) return true; // no location back — keep rather than silently drop
      return (
        distanceMiles(p.location, cell.center) <= cell.radiusMiles * 1.15 &&
        distanceMiles(p.location, center) <= radiusMiles * 1.15
      );
    });
    for (const p of inRange) {
      if (!byId.has(p.placeId)) byId.set(p.placeId, p);
    }

    const saturated = raw.length >= PLACE_RESULT_CAP;
    if (saturated) {
      if (cell.depth < MAX_DEPTH && cell.radiusMiles / 2 >= FLOOR_RADIUS_MILES) {
        const childRadius = cell.radiusMiles / 2;
        const offsets = [
          { dx: childRadius / 1.4, dy: childRadius / 1.4 },
          { dx: -childRadius / 1.4, dy: childRadius / 1.4 },
          { dx: childRadius / 1.4, dy: -childRadius / 1.4 },
          { dx: -childRadius / 1.4, dy: -childRadius / 1.4 },
        ];
        for (const off of offsets) {
          queue.push({
            center: {
              lat: cell.center.lat + milesToLatDegrees(off.dy),
              lng: cell.center.lng + milesToLngDegrees(off.dx, cell.center.lat),
            },
            radiusMiles: childRadius * 1.1, // slight overlap so sub-tile edges don't gap
            depth: cell.depth + 1,
          });
        }
      } else {
        // Hit the floor tile size or max recursion depth while still saturated — this
        // pocket is denser than the sweep can resolve; report it as incomplete rather
        // than pretending the 20 results returned are all of them.
        saturatedUnexpandedCells += 1;
      }
    }
  }

  return {
    places: [...byId.values()],
    callsMade,
    complete: !budgetExhausted && saturatedUnexpandedCells === 0,
    saturatedUnexpandedCells,
  };
}

/** Re-fetches a single place's current details by ID — used to refresh a stored
 * lead's Google-sourced fields instead of treating our copy as permanent. */
export async function getPlaceDetails(placeId: string): Promise<PlaceResult> {
  const key = await requireGoogleKey();
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    method: "GET",
    headers: {
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": PLACE_FIELD_MASK.replace(/places\./g, ""),
    },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Google Places error ${res.status}: ${t.slice(0, 300)}`);
  }
  const p = (await res.json()) as {
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    nationalPhoneNumber?: string;
    rating?: number;
    userRatingCount?: number;
    websiteUri?: string;
    location?: { latitude: number; longitude: number };
  };
  return {
    placeId: p.id ?? placeId,
    name: p.displayName?.text ?? "",
    address: p.formattedAddress ?? "",
    phone: p.nationalPhoneNumber ?? null,
    website: p.websiteUri ?? null,
    rating: p.rating ?? null,
    reviewCount: p.userRatingCount ?? null,
    location: p.location ? { lat: p.location.latitude, lng: p.location.longitude } : null,
  };
}
