export type LegalItemType = 'covered' | 'excluded' | 'check' | 'plain';

export interface LegalItem {
  text: string;
  type: LegalItemType;
}

export interface LegalSection {
  icon: string;
  title: string;
  intro: string;
  items: LegalItem[];
}

export interface LegalPageContent {
  badge: string;
  title_main: string;
  title_highlight: string;
  intro: string;
  sections: LegalSection[];
  disclaimer_title: string;
  disclaimer_paragraphs: string[];
}

// Mirrors the content each page shipped with — used as the fallback
// whenever the admin hasn't saved an explicit override yet.
export const DEFAULT_REFUND_POLICY: LegalPageContent = {
  badge: 'Official Policy Document',
  title_main: 'Refund &',
  title_highlight: 'Warranty Policy',
  intro: "This document outlines Navrik's warranty coverage, return procedures, and liability terms. Please read carefully before placing your order.",
  sections: [
    {
      icon: 'verified',
      title: 'Tray Warranty — 24 Months',
      intro: 'Navrik guarantees all aluminium bakkie trays against manufacturing defects for a period of 24 months from the date of purchase.',
      items: [
        { type: 'covered', text: 'Structural integrity failures caused by manufacturing defects' },
        { type: 'covered', text: 'Welding failures or joint separations under normal use' },
        { type: 'covered', text: 'Headboard and drop-side bracket failures' },
        { type: 'covered', text: 'LED light kit manufacturing faults (not bulb burnout)' },
        { type: 'covered', text: 'Powder coating adhesion failures within 12 months (Premium / Standard colour option)' },
        { type: 'excluded', text: 'Damage caused by overloading beyond specified load ratings' },
        { type: 'excluded', text: 'Damage resulting from accidents, impacts, or collisions' },
        { type: 'excluded', text: 'Corrosion or oxidation caused by chemical exposure or saltwater environments' },
        { type: 'excluded', text: 'Modifications made by the customer or third parties' },
        { type: 'excluded', text: 'Normal wear and tear, scratches, or aesthetic surface marks' },
        { type: 'excluded', text: 'Damage caused by improper fitment not performed by authorised Navrik installers' },
      ],
    },
    {
      icon: 'inventory_2',
      title: 'Toolbox Warranty — 12 Months',
      intro: 'All Navrik flat-plate aluminium toolboxes (included with Premium Tray configurations) are covered by a 12-month warranty against manufacturing defects.',
      items: [
        { type: 'covered', text: 'Structural welds and joins on toolbox body and lid' },
        { type: 'covered', text: 'Hinge mechanisms and lid-sealing strips' },
        { type: 'covered', text: 'Lock cylinders (where applicable) against mechanical failure' },
        { type: 'excluded', text: 'Dents, scratches, or aesthetic damage from use' },
        { type: 'excluded', text: 'Damage from overloading or misuse' },
      ],
    },
    {
      icon: 'gavel',
      title: 'Warranty Terms & Conditions',
      intro: '',
      items: [
        { type: 'covered', text: 'Proof of purchase (invoice or order confirmation) is required for all warranty claims' },
        { type: 'covered', text: 'The warranty is valid only for the original purchaser and is non-transferable' },
        { type: 'covered', text: 'Warranty claims must be submitted within the warranty period via our contact details' },
        { type: 'covered', text: 'Navrik reserves the right to inspect the product before approving a claim' },
        { type: 'covered', text: "Approved claims will result in repair or replacement at Navrik's discretion" },
        { type: 'excluded', text: 'The warranty does not cover transport costs to and from a Navrik service point' },
      ],
    },
    {
      icon: 'payments',
      title: 'Returns & Refunds',
      intro: 'Due to the custom-built nature of our products, returns and refunds are subject to the following conditions:',
      items: [
        { type: 'covered', text: 'Cancellations made before production begins will receive a full refund of the deposit' },
        { type: 'covered', text: 'Cancellations made after production begins but before delivery will incur a 25% cancellation fee' },
        { type: 'excluded', text: 'No returns or refunds are accepted once the tray has been fitted to the vehicle' },
        { type: 'excluded', text: 'Custom powder-coated orders (Black or White) are non-refundable once production has started' },
        { type: 'covered', text: 'Products with verified manufacturing defects will be replaced or refunded in full' },
        { type: 'covered', text: 'All refunds will be processed within 7–14 business days of approval' },
        { type: 'plain', text: 'Deposit Policy: A 20% non-refundable deposit is required to secure your pre-order and begin production scheduling. The remaining balance is due before or on delivery/fitment day.' },
      ],
    },
    {
      icon: 'build',
      title: 'Inspection & Maintenance',
      intro: 'To maintain your warranty and ensure longevity, follow this maintenance checklist:',
      items: [
        { type: 'check', text: 'Inspect all mounting bolts and support rail connections every 6 months or after heavy off-road use' },
        { type: 'check', text: 'Clean the tray with water and a mild detergent — avoid harsh chemical cleaners or acid-based products' },
        { type: 'check', text: 'Check LED lights and electrical connections periodically, especially after water exposure' },
        { type: 'check', text: 'Inspect powder-coated surfaces for chips or scratches and touch up promptly to prevent corrosion' },
        { type: 'check', text: 'For toolboxes, lubricate hinge mechanisms and lock cylinders annually with a light machine oil' },
        { type: 'check', text: 'Do not exceed the load rating — contact Navrik for load specifications for your specific tray model' },
      ],
    },
  ],
  disclaimer_title: 'Liability Disclaimer',
  disclaimer_paragraphs: [
    'Navrik shall not be liable for any indirect, incidental, special, or consequential damages arising from the use or inability to use our products, including but not limited to loss of income, loss of cargo, or vehicle damage caused by product failure beyond normal warranty coverage.',
    "Navrik's total liability in any claim shall not exceed the original purchase price of the product. This warranty gives you specific legal rights, and you may also have other rights which vary from region to region under applicable South African consumer protection law.",
  ],
};

export const DEFAULT_TERMS_OF_SERVICE: LegalPageContent = {
  badge: 'SPEC REF // DOC-2026-REV-A',
  title_main: 'Terms &',
  title_highlight: 'Warranty.',
  intro: 'Official purchasing, fitment, and warranty policies for Navrik products.',
  sections: [
    {
      icon: 'gavel',
      title: '1. Agreement to Terms',
      intro: 'By purchasing Navrik trays or accessories, applying as a dealer, or booking a fitment, you agree to be bound by these industrial terms of service. These policies apply to all commercial partners, dealerships, and individual buyers across Africa.',
      items: [],
    },
    {
      icon: 'payments',
      title: '2. Orders & Invoicing',
      intro: 'All hardware orders and custom fabrications are subject to availability and production lead times.',
      items: [
        { type: 'plain', text: 'Payment: Full payment or an approved dealer purchase order is required before heavy freight dispatch or fitment scheduling.' },
        { type: 'plain', text: 'Pricing: Quotes are valid for 14 days. Prices are subject to change based on raw material costs and import fluctuations.' },
      ],
    },
    {
      icon: 'assignment_return',
      title: '3. Returns & Warranty',
      intro: 'Navrik products are manufactured to the highest engineering standards. Our warranty and return parameters are strict to maintain quality control:',
      items: [
        { type: 'plain', text: 'Standard Returns: Unmounted, damage-free accessories may be returned within 14 days. A 15% restocking fee applies, and return freight is the buyer\'s responsibility.' },
        { type: 'plain', text: 'Structural Warranty: Premium trays carry a limited structural warranty against manufacturing defects. Surface finishes and wear-and-tear from heavy payload use are excluded.' },
        { type: 'plain', text: 'Custom Fitments: Once a tray is permanently fitted or custom-modified for a specific chassis, it cannot be returned unless structurally defective out of the box.' },
      ],
    },
    {
      icon: 'engineering',
      title: '4. Fitment & Liability',
      intro: 'Installation matters. We strongly mandate that all premium trays be installed by an Exclusive Navrik Fitment Partner. Navrik accepts zero liability for chassis damage, sensor malfunctions, or structural failures resulting from unauthorized third-party installations or DIY fitment.',
      items: [],
    },
    {
      icon: 'local_shipping',
      title: '5. Heavy Freight & Delivery',
      intro: 'Due to the size and weight of our bakkie trays, standard courier times do not apply. Delivery requires heavy freight logistics. Buyers must ensure their receiving facility or fitment center has the capacity (e.g., forklifts or loading bays) to offload industrial cargo safely.',
      items: [],
    },
    {
      icon: 'contact_support',
      title: '6. Dealer & Customer Support',
      intro: 'For warranty claims, dealer recruitment inquiries, or dispatch tracking, contact our logistics and support hub directly.',
      items: [],
    },
  ],
  disclaimer_title: '',
  disclaimer_paragraphs: [],
};
