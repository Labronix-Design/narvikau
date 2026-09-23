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
  title_main: 'Returns &',
  title_highlight: 'Warranty Policy',
  intro: "This document outlines Navrik Australia's canopy warranty coverage, return procedures, and support process.",
  sections: [
    {
      icon: 'verified',
      title: 'Canopy Warranty — 24 Months',
      intro: 'Navrik aluminium canopies are covered against manufacturing defects for 24 months from the recorded acquisition date.',
      items: [
        { type: 'covered', text: 'Structural integrity failures caused by manufacturing defects' },
        { type: 'covered', text: 'Welding failures or joint separations under normal use' },
        { type: 'covered', text: 'Door, hinge, seal, or fastening failures caused by manufacturing defects' },
        { type: 'covered', text: 'Powder coating adhesion failures within 12 months' },
        { type: 'excluded', text: 'Damage caused by overloading beyond specified load ratings' },
        { type: 'excluded', text: 'Damage resulting from accidents, impacts, or collisions' },
        { type: 'excluded', text: 'Corrosion or oxidation caused by chemical exposure or saltwater environments' },
        { type: 'excluded', text: 'Modifications made by the customer or third parties' },
        { type: 'excluded', text: 'Normal wear and tear, scratches, or aesthetic surface marks' },
        { type: 'excluded', text: 'Damage caused by improper fitment not performed by authorised Navrik installers' },
      ],
    },
    {
      icon: 'gavel',
      title: 'Warranty Terms & Conditions',
      intro: '',
      items: [
        { type: 'covered', text: 'Warranty registration and supporting acquisition details may be required for a claim' },
        { type: 'covered', text: 'The warranty is valid only for the original purchaser and is non-transferable' },
        { type: 'covered', text: 'Warranty claims must be submitted within the warranty period via our contact details' },
        { type: 'covered', text: 'Navrik reserves the right to inspect the product before approving a claim' },
        { type: 'covered', text: "Approved claims will result in repair or replacement at Navrik's discretion" },
        { type: 'excluded', text: 'The warranty does not cover transport costs to and from a Navrik service point' },
      ],
    },
    {
      icon: 'assignment_return',
      title: 'Returns & Remedies',
      intro: 'Because canopies are selected and fitted for specific vehicles, contact Navrik before returning a product.',
      items: [
        { type: 'covered', text: 'Unused and unfitted products may be assessed for return after contacting Navrik' },
        { type: 'covered', text: 'Products with verified manufacturing defects will receive an appropriate remedy' },
        { type: 'excluded', text: 'Change-of-mind returns may not be available after customisation or fitment' },
        { type: 'plain', text: 'Nothing in this policy excludes rights or consumer guarantees that cannot lawfully be excluded under the Australian Consumer Law.' },
      ],
    },
    {
      icon: 'build',
      title: 'Inspection & Maintenance',
      intro: 'To maintain your warranty and ensure longevity, follow this maintenance checklist:',
      items: [
        { type: 'check', text: 'Inspect all mounting bolts and support rail connections every 6 months or after heavy off-road use' },
        { type: 'check', text: 'Clean the canopy with water and a mild detergent — avoid harsh chemical cleaners or acid-based products' },
        { type: 'check', text: 'Check doors, seals, fasteners, and electrical connections periodically' },
        { type: 'check', text: 'Inspect powder-coated surfaces for chips or scratches and touch up promptly to prevent corrosion' },
        { type: 'check', text: 'Lubricate hinge mechanisms and lock cylinders annually with a light machine oil' },
        { type: 'check', text: 'Do not exceed the specified load rating — contact Navrik for guidance for your canopy model' },
      ],
    },
  ],
  disclaimer_title: 'Liability Disclaimer',
  disclaimer_paragraphs: [
    'Navrik shall not be liable for any indirect, incidental, special, or consequential damages arising from the use or inability to use our products, including but not limited to loss of income, loss of cargo, or vehicle damage caused by product failure beyond normal warranty coverage.',
    'This warranty operates alongside rights and remedies available under the Australian Consumer Law. It does not exclude any consumer guarantee or remedy that cannot lawfully be excluded.',
  ],
};

export const DEFAULT_TERMS_OF_SERVICE: LegalPageContent = {
  badge: 'SPEC REF // DOC-2026-REV-A',
  title_main: 'Terms &',
  title_highlight: 'Service.',
  intro: 'Website, enquiry, fitment, and warranty terms for Navrik Australia canopies.',
  sections: [
    {
      icon: 'gavel',
      title: '1. Agreement to Terms',
      intro: 'By using this website, requesting canopy information, or arranging fitment support, you agree to these terms. These terms apply to Navrik Australia website users and enquiry customers.',
      items: [],
    },
    {
      icon: 'format_quote',
      title: '2. Enquiries & Quotes',
      intro: 'This website provides product information and accepts quote requests. Submitting an enquiry does not create a sale or reserve production capacity.',
      items: [
        { type: 'plain', text: 'Canopy specifications, availability, lead times, and vehicle fitment must be confirmed by the Navrik team.' },
        { type: 'plain', text: 'A quote request should include accurate vehicle and contact information so the team can respond appropriately.' },
      ],
    },
    {
      icon: 'assignment_return',
      title: '3. Returns & Warranty',
      intro: 'Navrik products are manufactured to the highest engineering standards. Our warranty and return parameters are strict to maintain quality control:',
      items: [
        { type: 'plain', text: 'Return and warranty requests are assessed under the published Returns & Warranty Policy.' },
        { type: 'plain', text: 'Structural warranty coverage applies to manufacturing defects; normal wear, misuse, and accident damage are excluded.' },
        { type: 'plain', text: 'Customised or fitted canopies may have different change-of-mind return eligibility, subject to Australian Consumer Law.' },
      ],
    },
    {
      icon: 'engineering',
      title: '4. Fitment & Liability',
      intro: 'Installation matters. Navrik recommends professional canopy fitment. Damage caused by incorrect third-party installation or unauthorised modification may fall outside warranty coverage, subject to applicable law.',
      items: [],
    },
    {
      icon: 'local_shipping',
      title: '5. Delivery & Collection',
      intro: 'Canopies require suitable transport and safe handling. Delivery, collection, and fitment arrangements are confirmed directly with the Navrik team for each enquiry.',
      items: [],
    },
    {
      icon: 'contact_support',
      title: '6. Dealer & Customer Support',
      intro: 'For warranty claims, canopy guidance, or fitment support, contact the Navrik Australia team directly.',
      items: [],
    },
  ],
  disclaimer_title: '',
  disclaimer_paragraphs: [],
};
