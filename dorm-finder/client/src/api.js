// Base URL from .env (Vite) — set VITE_API_URL=http://localhost:4000
export const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";

function applyQueryParams(url, params) {
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null) continue;
    if (value instanceof Set) {
      for (const item of value) {
        if (item !== undefined && item !== null && item !== "") {
          url.searchParams.append(key, String(item));
        }
      }
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const normalized = typeof item === "string" ? item.trim() : item;
        if (normalized !== undefined && normalized !== null && normalized !== "") {
          url.searchParams.append(key, String(normalized));
        }
      }
      continue;
    }
    if (value === "") continue;
    url.searchParams.set(key, String(value));
  }
}

/**
 * Fetch dorms with optional bounds.
 * Expects an object like { north, south, east, west } (numbers)
 */
export async function fetchDorms(params = {}) {
  const url = new URL("/api/dorms", API_BASE);
  applyQueryParams(url, params);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

/**
 * Fetch points of interest with optional text/category and bounds.
 * Accepts: { q, category, north, south, east, west }
 */
export async function fetchPois(params = {}) {
  const url = new URL("/api/pois", API_BASE);
  applyQueryParams(url, params);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}
