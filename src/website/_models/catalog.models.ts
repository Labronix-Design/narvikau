export interface CatalogProduct {
  id: number;
  slug: string;
  name: string;
  category: string;
  specifications: Record<string, string>;
  size?: string | null;
  color?: string | null;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  gallery_urls: string[];
  material?: string | null;
  thickness?: string | null;
  front_door_window?: string | null;
  side_door?: string | null;
  rear_door?: string | null;
  vehicle_fit?: string | null;
}

/** Keep only own string values; never invoke accessors from malformed payloads. */
export function toRenderableSpecifications(value: unknown): Record<string, string> {
  if (value === null || typeof value !== 'object') return {};

  try {
    if (Array.isArray(value)) return {};
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return {};

    const specifications: Record<string, string> = {};
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
      const label = key.trim();
      if (!label || label === '__proto__' || label === 'constructor' || label === 'prototype') continue;
      if (descriptor.enumerable && 'value' in descriptor && typeof descriptor.value === 'string') {
        specifications[label] = descriptor.value;
      }
    }
    return specifications;
  } catch {
    // Reject hostile proxies as well as malformed JSON-shaped objects.
    return {};
  }
}
