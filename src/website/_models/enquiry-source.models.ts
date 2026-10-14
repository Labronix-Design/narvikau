import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export const ENQUIRY_SOURCE_OPTIONS = [
  'Google Search',
  'Other Web Search',
  'Facebook',
  'Instagram',
  'ChatGPT',
  'Claude',
  'Gemini',
  'Other AI Platform',
  'Referral',
  'Other',
] as const;

export type EnquirySource = (typeof ENQUIRY_SOURCE_OPTIONS)[number];

const SOURCES_REQUIRING_DETAIL = new Set<EnquirySource>(['Other AI Platform', 'Referral', 'Other']);

export function sourceRequiresDetail(source: string): boolean {
  return SOURCES_REQUIRING_DETAIL.has(source as EnquirySource);
}

export const sourceDetailRequiredValidator: ValidatorFn = (form: AbstractControl): ValidationErrors | null => {
  const source = form.get('DiscoverySource')?.value as string | undefined;
  const detail = form.get('DiscoverySourceDetail')?.value as string | undefined;
  if (!sourceRequiresDetail(source ?? '')) return null;
  if (!detail?.trim()) return { discoverySourceDetailRequired: true };
  return detail.trim().length > 120 || /[\u0000-\u001F\u007F]/.test(detail)
    ? { discoverySourceDetailInvalid: true }
    : null;
};
