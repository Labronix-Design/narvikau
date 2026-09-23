export interface CatalogCategory {
  id: number;
  slug: string;
  name: string;
  type: 'product' | 'accessory';
  eyebrow: string | null;
  icon: string | null;
  description: string | null;
  sort_order: number;
  is_active: boolean;
}

export type PurchaseMode = 'online_checkout' | 'quote_only';

/**
 * Public cache snapshots now provide a resolved mode. The positive-price fallback
 * keeps older snapshots safe while the catalogue migration is in progress.
 */
export function resolveCatalogPurchaseMode(
  purchaseMode: PurchaseMode | null | undefined,
  priceCents: number | null | undefined,
): PurchaseMode {
  const hasPositivePrice = Number.isSafeInteger(priceCents) && (priceCents ?? 0) > 0;
  if (!hasPositivePrice) return 'quote_only';
  if (purchaseMode === 'online_checkout') return 'online_checkout';
  return purchaseMode === undefined ? 'online_checkout' : 'quote_only';
}

export interface CatalogProduct {
  id: number;
  slug: string;
  name: string;
  category: 'tray' | 'canopy';
  tray_type: 'standard' | 'premium' | null;
  size: string | null;
  color: string;
  base_price: number;
  coating_cost: number;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  gallery_urls: string[];
  material: string | null;
  thickness: string | null;
  front_door_window: string | null;
  side_door: string | null;
  rear_door: string | null;
  vehicle_fit: string | null;
  /** Public cached variants. Amounts are display metadata only; checkout resolves them again on the server. */
  variants?: CatalogProductVariant[];
  base_price_cents?: number;
  coating_cost_cents?: number;
  purchaseMode?: PurchaseMode;
}

export interface CatalogProductVariant {
  id: number;
  variant_type: string;
  variant_value: string;
  label: string;
  price_delta_cents: number;
  sort_order: number;
}

export interface CatalogAccessory {
  id: number;
  slug: string;
  name: string;
  category: 'toolbox' | 'drop_side' | 'sequential_led' | 'rear_guard' | 'canopy';
  price: number;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  price_cents?: number;
  purchaseMode?: PurchaseMode;
}

/** Returned by /api/catalog-compatibility — accessory fields are inlined from the JOIN. */
export interface CompatibilityRule {
  id: number;
  accessory_id: number;
  accessory_name: string;
  accessory_category: string;
  accessory_price: number;
  accessory_description: string | null;
  accessory_image_url: string | null;
  tray_type: 'standard' | 'premium' | null;
  product_id: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  notes: string | null;
}
