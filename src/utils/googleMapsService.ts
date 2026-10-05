/**
 * Google Maps & Places Service for Gym Recognition and Location Discovery
 */

import { Gym } from "../types";

export interface NearbyGymResult {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating?: number;
  userRatingsTotal?: number;
  distanceKm: number;
  googlePlaceId?: string;
  mapsUrl?: string;
}

export interface GymDetectionResponse {
  recognizedGym: NearbyGymResult | null;
  confidence: "high" | "medium" | "low" | "none";
  alternatives: NearbyGymResult[];
  userLocation: { lat: number; lng: number } | null;
  error?: string;
}

/**
 * Requests user's current GPS coordinates via browser Geolocation API
 */
export function getCurrentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Geolocation is not supported by your browser."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
      },
      (error) => {
        let msg = "Failed to retrieve location.";
        if (error.code === error.PERMISSION_DENIED) {
          msg = "Location permission denied. Please allow location access to recognize nearby gyms.";
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          msg = "Location information unavailable.";
        } else if (error.code === error.TIMEOUT) {
          msg = "Location request timed out.";
        }
        reject(new Error(msg));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000
      }
    );
  });
}

/**
 * Detects closest gym at athlete's location via Google Maps Places backend endpoint
 */
export async function detectCurrentGym(coords?: { lat: number; lng: number }): Promise<GymDetectionResponse> {
  try {
    const loc = coords || (await getCurrentPosition());
    const response = await fetch("/api/gyms/detect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat: loc.lat, lng: loc.lng })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || "Failed to detect gym location.");
    }

    const data: GymDetectionResponse = await response.json();
    return data;
  } catch (err: any) {
    console.warn("Gym detection notice:", err?.message);
    return {
      recognizedGym: null,
      confidence: "none",
      alternatives: [],
      userLocation: coords || null,
      error: err?.message || "Location detection disabled"
    };
  }
}

/**
 * Searches nearby gyms or text query using Google Maps Places API backend endpoint
 */
export async function searchNearbyGyms(params: {
  lat?: number;
  lng?: number;
  query?: string;
  radiusMeters?: number;
}): Promise<NearbyGymResult[]> {
  try {
    const response = await fetch("/api/gyms/nearby", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params)
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || "Failed to fetch nearby gyms.");
    }

    const data = await response.json();
    return Array.isArray(data.gyms) ? data.gyms : [];
  } catch (err: any) {
    console.error("Error searching nearby gyms:", err);
    return [];
  }
}

/**
 * Helper to convert NearbyGymResult into standard Gym app entity
 */
export function convertResultToGym(result: NearbyGymResult, isDefault = false): Gym {
  return {
    id: result.googlePlaceId || `gym-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    name: result.name,
    location: result.address,
    address: result.address,
    lat: result.lat,
    lng: result.lng,
    googlePlaceId: result.googlePlaceId,
    rating: result.rating,
    userRatingsTotal: result.userRatingsTotal,
    distanceKm: result.distanceKm,
    mapsUrl: result.mapsUrl,
    isDefault,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

/**
 * Constructs static Google Map URL for thumbnail previews
 */
export function getStaticMapThumbnailUrl(lat: number, lng: number, zoom = 15): string {
  const apiKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY || "";
  if (!apiKey) return "";
  return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=${zoom}&size=400x200&markers=color:red%7C${lat},${lng}&key=${apiKey}`;
}
