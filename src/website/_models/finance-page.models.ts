export interface FinanceBenefit {
  icon: string;
  title: string;
  desc: string;
}

export interface FinanceStep {
  num: string;
  title: string;
  desc: string;
}

export interface FinanceTrustItem {
  icon: string;
  label: string;
}

export interface FinancePageContent {
  hero_badge: string;
  hero_title: string;
  hero_subtitle: string;
  apply_url: string;
  partner_logo_url: string;
  benefits: FinanceBenefit[];
  steps: FinanceStep[];
  requirements: string[];
  requirements_note: string;
  cta_title: string;
  cta_body: string;
  cta_disclaimer: string;
  trust_items: FinanceTrustItem[];
}

// Mirrors the content the finance page shipped with — used as the fallback
// whenever the admin hasn't saved an explicit override yet.
export const DEFAULT_FINANCE_CONTENT: FinancePageContent = {
  hero_badge: 'Vehicle & Asset Finance',
  hero_title: 'Finance opportunity with ABSA.',
  hero_subtitle: 'Spread the cost of your premium Navrik bakkie tray, canopy, or accessory package over flexible monthly instalments — backed by ABSA Vehicle and Asset Finance.',
  apply_url: 'https://www.absa.co.za/vehicle-finance/',
  partner_logo_url: 'assets/brand-logo/absa.svg',
  benefits: [
    { icon: 'schedule', title: 'Fast Approval', desc: 'Pre-qualification in minutes with no impact on your credit score.' },
    { icon: 'payments', title: 'Flexible Terms', desc: 'Repayment terms from 12 to 72 months to suit your budget.' },
    { icon: 'percent', title: 'Competitive Rates', desc: 'Personalised interest rates linked to your credit profile.' },
    { icon: 'verified', title: 'ABSA Backed', desc: "Financing through ABSA, one of South Africa's most trusted banks." },
  ],
  steps: [
    { num: '01', title: 'Get a Quote', desc: 'Configure your bakkie tray or canopy on our Products page and request a formal quote.' },
    { num: '02', title: 'Apply with ABSA', desc: 'Submit your ABSA Vehicle and Asset Finance application using your Navrik quote as supporting documentation.' },
    { num: '03', title: 'Approval', desc: 'ABSA reviews and approves your application. Typical turnaround is 24–48 business hours.' },
    { num: '04', title: 'Order & Fitment', desc: 'Once approved, place your order. Navrik fabricates and installs your tray or canopy.' },
  ],
  requirements: [
    'South African ID document or passport',
    "Latest 3 months' bank statements",
    'Proof of income (payslip or letter of appointment)',
    'Proof of residence (not older than 3 months)',
    'Completed ABSA application form',
  ],
  requirements_note: 'Final documentation requirements are determined by ABSA at application stage.',
  cta_title: 'Ready to Apply?',
  cta_body: 'First configure your Navrik product and request a formal quote. Then submit your ABSA application with the quote as supporting documentation.',
  cta_disclaimer: 'Navrik is not a registered credit provider. Finance is arranged directly with ABSA. Subject to credit approval and ABSA terms and conditions.',
  trust_items: [
    { icon: 'security', label: 'Secure ABSA Application' },
    { icon: 'verified_user', label: 'NCR Regulated Finance' },
    { icon: 'support_agent', label: 'Navrik Support Throughout' },
    { icon: 'build', label: '2.5mm Aluminium Quality' },
  ],
};
