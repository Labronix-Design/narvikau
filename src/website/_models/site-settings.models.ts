export interface HeroSlide {
  image_url: string;
  alt: string;
}

export interface BrandLogo {
  brand: string;
  model: string;
  logo_url: string;
}

export interface BusinessHoursRow {
  label: string;
  hours: string;
  closed: boolean;
}

export interface TrustBarItem {
  icon: string;
  label: string;
}

export interface ContactInfo {
  email: string;
  phone: string;
  whatsapp: string;
  location: string;
  business_hours: BusinessHoursRow[];
}

export interface SiteSettings {
  logo_url: string | null;
  font_family: string;
  primary_color: string;
  hero_slides: HeroSlide[];
  brand_logos: BrandLogo[];
  contact: ContactInfo;
  trust_bar: TrustBarItem[];
  compat_note: string;
}

export const DEFAULT_CONTACT_INFO: ContactInfo = {
  email: 'info@navrik.co.za',
  phone: '',
  whatsapp: '',
  location: 'Johannesburg South, Gauteng',
  business_hours: [
    { label: 'Monday – Friday', hours: '08:00 – 17:00', closed: false },
    { label: 'Saturday',        hours: '09:00 – 13:00', closed: false },
    { label: 'Sunday',          hours: 'Closed',         closed: true  },
  ],
};

// Single source of truth for "what shows when nothing's been configured yet".
// Used by the homepage as its fallback AND by the admin settings page to
// pre-populate the editable lists — so opening Site Settings for the first
// time shows what's actually live, not a blank slate.
export const DEFAULT_HERO_SLIDES: HeroSlide[] = [
  { image_url: 'assets/canopies/canopy-isuzu-dmax-studio-side-roofrack.jpg', alt: 'Navrik bakkie tray — image 1' },
  { image_url: 'assets/canopies/canopy-isuzu-dmax-studio-rear-3q-roofrack.jpg', alt: 'Navrik bakkie tray — image 2' },
  { image_url: 'assets/carousel/PHOTO-2026-04-23-12-44-01%203.jpg', alt: 'Navrik bakkie tray — image 3' },
  { image_url: 'assets/carousel/PHOTO-2026-04-23-12-44-02.jpg', alt: 'Navrik bakkie tray — image 4' },
];

export const DEFAULT_TRUST_BAR: TrustBarItem[] = [
  { icon: 'build',           label: '2.5mm Aluminium Alloy' },
  { icon: 'verified',        label: '24-Month Structural Warranty' },
  { icon: 'directions_car',  label: 'Universal Fitment' },
  { icon: 'handyman',        label: 'Full Fitment Service' },
];

export const DEFAULT_COMPAT_NOTE =
  'Universal fit — some vehicles may require minor modifications. Contact us to confirm your specific model.';

export const DEFAULT_BRAND_LOGOS: BrandLogo[] = [
  { brand: 'Toyota',     model: 'Hilux',       logo_url: 'assets/brand-logo/toyota.svg' },
  { brand: 'Ford',       model: 'Ranger',      logo_url: 'assets/brand-logo/ford.svg' },
  { brand: 'Nissan',     model: 'Navara',      logo_url: 'assets/brand-logo/nissan.svg' },
  { brand: 'Isuzu',      model: 'D-Max',       logo_url: 'assets/brand-logo/isuzu.svg' },
  { brand: 'Mitsubishi', model: 'Triton',      logo_url: 'assets/brand-logo/mitsubishi.svg' },
  { brand: 'Mazda',      model: 'BT-50',       logo_url: 'assets/brand-logo/mazda.svg' },
  { brand: 'Toyota',     model: 'Land Cruiser', logo_url: 'assets/brand-logo/toyota.svg' },
];

// Curated list — bold/industrial-leaning faces that suit the brand, kept
// short so the admin picks from a sane set instead of all ~1800 Google Fonts.
export const GOOGLE_FONT_OPTIONS = [
  'Inter',
  'Roboto Condensed',
  'Barlow Condensed',
  'Oswald',
  'Bebas Neue',
  'Montserrat',
  'Archivo',
  'Rajdhani',
  'Teko',
  'Work Sans',
] as const;
