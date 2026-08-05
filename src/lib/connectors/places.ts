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
}

const PLACE_FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.rating,places.userRatingCount,places.websiteUri";

const MAX_RADIUS_METERS = 50_000;

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
      "User-Agent": "ClientPilot/0.1 (contact: local desktop app; +https://clientpilot.local)",
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
    }))
    .slice(0, maxResults);
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
  };
  return {
    placeId: p.id ?? placeId,
    name: p.displayName?.text ?? "",
    address: p.formattedAddress ?? "",
    phone: p.nationalPhoneNumber ?? null,
    website: p.websiteUri ?? null,
    rating: p.rating ?? null,
    reviewCount: p.userRatingCount ?? null,
  };
}
