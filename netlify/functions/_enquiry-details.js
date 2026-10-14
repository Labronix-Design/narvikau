export const ENQUIRY_TYPES = Object.freeze(['product_quote', 'general_contact', 'dealer_enquiry', 'fitment_enquiry']);
export const AU_STATES_AND_TERRITORIES = Object.freeze([
  'Australian Capital Territory', 'New South Wales', 'Northern Territory', 'Queensland',
  'South Australia', 'Tasmania', 'Victoria', 'Western Australia',
]);
export const DISCOVERY_SOURCES = Object.freeze([
  'Google Search', 'Other Web Search', 'Facebook', 'Instagram', 'ChatGPT', 'Claude',
  'Gemini', 'Other AI Platform', 'Referral', 'Other',
]);
export const DISCOVERY_SOURCES_REQUIRING_DETAIL = Object.freeze(['Other AI Platform', 'Referral', 'Other']);

export class SubmissionValidationError extends Error {}

export function enquiryText(value, field, { required = false, maxLength, multiline = false }) {
  if (value === undefined || value === null) {
    if (required) throw new SubmissionValidationError(`${field} is required`);
    return '';
  }
  if (typeof value !== 'string') throw new SubmissionValidationError(`${field} must be text`);
  const normalised = multiline ? value.replace(/\r\n/g, '\n') : value;
  if ((multiline ? /[\u0000-\u0009\u000B-\u001F\u007F]/ : /[\u0000-\u001F\u007F]/).test(normalised)) throw new SubmissionValidationError(`${field} contains unsupported characters`);
  const trimmed = normalised.trim();
  if (required && !trimmed) throw new SubmissionValidationError(`${field} is required`);
  if (trimmed.length > maxLength) throw new SubmissionValidationError(`${field} is too long`);
  return trimmed;
}

export function validateEnquiryDetails(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new SubmissionValidationError('Invalid enquiry details');
  const details = {
    LocationState: enquiryText(payload.LocationState, 'LocationState', { required: true, maxLength: 32 }),
    LocationSuburb: enquiryText(payload.LocationSuburb, 'LocationSuburb', { required: true, maxLength: 160 }),
    DiscoverySource: enquiryText(payload.DiscoverySource, 'DiscoverySource', { required: true, maxLength: 40 }),
    DiscoverySourceDetail: enquiryText(payload.DiscoverySourceDetail, 'DiscoverySourceDetail', { maxLength: 120 }),
  };
  if (!AU_STATES_AND_TERRITORIES.includes(details.LocationState)) throw new SubmissionValidationError('Select an Australian state or territory');
  if (!DISCOVERY_SOURCES.includes(details.DiscoverySource)) throw new SubmissionValidationError('DiscoverySource is invalid');
  const needsDetail = DISCOVERY_SOURCES_REQUIRING_DETAIL.includes(details.DiscoverySource);
  if (needsDetail !== Boolean(details.DiscoverySourceDetail)) throw new SubmissionValidationError('DiscoverySourceDetail is invalid');
  return details;
}

export function enquiryTypeLabel(type) {
  return ({ product_quote: 'Product quote', general_contact: 'General contact', dealer_enquiry: 'Dealer enquiry', fitment_enquiry: 'Fitment centre enquiry' })[type] || '';
}

// These are plain text display values; callers escape them at their HTML boundary.
export function enquiryDetailRows(lead) {
  return [
    ['Enquiry type', enquiryTypeLabel(lead.EnquiryType)],
    ['State / territory', lead.LocationState], ['Suburb / locality', lead.LocationSuburb],
    ['How they found us', lead.DiscoverySource],
    ...(lead.DiscoverySourceDetail ? [['Referral details', lead.DiscoverySourceDetail]] : []),
  ];
}
