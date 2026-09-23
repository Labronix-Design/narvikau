/**
 * Seed the fresh Navrik Australia catalogue.
 *
 * Run with: netlify dev exec node netlify/assets/seed.mjs
 * Or:       NETLIFY_DATABASE_URL="postgresql://..." node netlify/assets/seed.mjs
 */

import { neon } from '@neondatabase/serverless';
import { rebuildCatalogueReadModels } from '../functions/_catalogue-cache.js';

const connectionString = process.env.NETLIFY_DATABASE_URL || process.env.NETLIFY_DB_URL;
if (!connectionString) {
  console.error('Database configuration is missing.');
  process.exit(1);
}

const sql = neon(connectionString);

const galleryUrls = [
  'assets/canopies/canopy-showroom-isuzu-roofrack.jpg',
  'assets/canopies/canopy-isuzu-dmax-studio-rear-3q-roofrack.jpg',
  'assets/canopies/canopy-isuzu-dmax-studio-rear-3q.jpg',
  'assets/canopies/canopy-isuzu-dmax-studio-side-roofrack.jpg',
  'assets/canopies/canopy-install-red-isuzu-outdoor.jpg',
  'assets/canopies/canopy-install-red-bakkie-1.jpg',
  'assets/canopies/canopy-install-red-bakkie-2.jpg',
];

const common = {
  category: 'canopy',
  color: 'black',
  material: '5052 Aluminium Alloy',
  thickness: '2mm',
  gallery_urls: galleryUrls,
  vehicle_fit: 'Isuzu D-Max (confirmed fit shown) — universal bracket kit, other models on request',
};

const canopies = [
  {
    slug: 'navrik-canopy-adventure',
    name: 'Navrik Canopy — Adventure',
    size: 'Adventure',
    description: 'The Adventure is a complete 5052-grade aluminium canopy with a durable three-layer coating.',
    image_url: 'assets/canopies/models/canopy-model-adventure-placeholder.jpg',
    front_door_window: 'Glass, sliding window optional',
    side_door: 'Aluminium door with gullwing',
    rear_door: 'Half glass window with spoiler trail',
    sort_order: 1,
  },
  {
    slug: 'navrik-canopy-overland',
    name: 'Navrik Canopy — Overland',
    size: 'Overland',
    description: 'The Overland is a complete 5052-grade aluminium canopy with a durable three-layer coating.',
    image_url: 'assets/canopies/models/canopy-model-overland-placeholder.jpg',
    front_door_window: 'Glass, sliding window optional',
    side_door: 'Small glass with sliding window',
    rear_door: 'Half glass window, optional',
    sort_order: 2,
  },
  {
    slug: 'navrik-canopy-sports',
    name: 'Navrik Canopy — Sports',
    size: 'Sports',
    description: 'The Sports is a complete 5052-grade aluminium canopy with a durable three-layer coating.',
    image_url: 'assets/canopies/models/canopy-model-sports-placeholder.jpg',
    front_door_window: 'Glass, sliding window optional',
    side_door: 'Big glass with small sliding window',
    rear_door: 'Half glass window, optional',
    sort_order: 3,
  },
  {
    slug: 'navrik-canopy-defender',
    name: 'Navrik Canopy — Defender',
    size: 'Defender',
    description: 'The Defender is a complete 5052-grade aluminium canopy with a durable three-layer coating.',
    image_url: 'assets/canopies/models/canopy-model-defender-placeholder.jpg',
    front_door_window: 'Glass, sliding window optional',
    side_door: 'Aluminium door with gullwing',
    rear_door: 'Half glass window, optional',
    sort_order: 4,
  },
].map((canopy) => ({ ...common, ...canopy }));

async function seed() {
  for (const canopy of canopies) {
    await sql`
      INSERT INTO catalog_products (
        slug, name, category, size, color, description, image_url, is_active, sort_order,
        gallery_urls, material, thickness, front_door_window, side_door, rear_door, vehicle_fit
      ) VALUES (
        ${canopy.slug}, ${canopy.name}, ${canopy.category}, ${canopy.size}, ${canopy.color},
        ${canopy.description}, ${canopy.image_url}, TRUE, ${canopy.sort_order},
        ${canopy.gallery_urls}, ${canopy.material}, ${canopy.thickness}, ${canopy.front_door_window},
        ${canopy.side_door}, ${canopy.rear_door}, ${canopy.vehicle_fit}
      )
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        category = EXCLUDED.category,
        size = EXCLUDED.size,
        color = EXCLUDED.color,
        description = EXCLUDED.description,
        image_url = EXCLUDED.image_url,
        is_active = TRUE,
        sort_order = EXCLUDED.sort_order,
        gallery_urls = EXCLUDED.gallery_urls,
        material = EXCLUDED.material,
        thickness = EXCLUDED.thickness,
        front_door_window = EXCLUDED.front_door_window,
        side_door = EXCLUDED.side_door,
        rear_door = EXCLUDED.rear_door,
        vehicle_fit = EXCLUDED.vehicle_fit,
        updated_at = NOW()
    `;
  }

  await rebuildCatalogueReadModels(sql, ['products']);
  console.log(`Seeded ${canopies.length} Australian canopy models.`);
}

seed().catch((error) => {
  console.error('Catalogue seed failed:', error instanceof Error ? error.message : 'unknown error');
  process.exit(1);
});
