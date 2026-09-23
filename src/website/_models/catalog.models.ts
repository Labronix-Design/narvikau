export interface CatalogProduct {
  id: number;
  slug: string;
  name: string;
  category: 'canopy';
  size: string | null;
  color: string;
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
}
