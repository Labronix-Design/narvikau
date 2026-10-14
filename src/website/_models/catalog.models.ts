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

export interface CatalogCategory {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  sort_order: number;
}

/** Accept only the public category shape; discard malformed server values. */
export function toRenderableCategories(value: unknown): CatalogCategory[] {
  if (!Array.isArray(value)) return [];

  try {
    return value.flatMap((entry: unknown) => {
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return [];
      const prototype = Object.getPrototypeOf(entry);
      if (prototype !== Object.prototype && prototype !== null) return [];
      const fields = Object.getOwnPropertyDescriptors(entry);
      const ownValue = (key: keyof CatalogCategory): unknown => {
        const descriptor = fields[key];
        return descriptor?.enumerable && 'value' in descriptor ? descriptor.value : undefined;
      };
      const id = ownValue('id');
      const slug = ownValue('slug');
      const name = ownValue('name');
      const description = ownValue('description');
      const sortOrder = ownValue('sort_order');
      if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0
        || typeof slug !== 'string' || slug.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
        || typeof name !== 'string' || !name.trim() || name.length > 160
        || description !== null && (typeof description !== 'string' || description.length > 2000)
        || typeof sortOrder !== 'number' || !Number.isSafeInteger(sortOrder) || Math.abs(sortOrder) > 100000) return [];
      return [{ id, slug, name, description, sort_order: sortOrder }];
    });
  } catch {
    return [];
  }
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
