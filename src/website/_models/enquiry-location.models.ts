import { FormControl, Validators } from '@angular/forms';
import { ENQUIRY_SOURCE_OPTIONS, sourceRequiresDetail } from './enquiry-source.models';

export const AU_STATES_AND_TERRITORIES: readonly string[] = [
  'Australian Capital Territory', 'New South Wales', 'Northern Territory', 'Queensland',
  'South Australia', 'Tasmania', 'Victoria', 'Western Australia',
];

export interface EnquiryLocationSelection {
  state: string;
  suburb: string;
}

export function locationForSubmission(value: EnquiryLocationSelection | null): EnquiryLocationSelection | null {
  if (!value || !AU_STATES_AND_TERRITORIES.includes(value.state)) return null;
  const suburb = typeof value.suburb === 'string' ? value.suburb.trim() : '';
  if (!suburb || suburb.length > 160 || /[\u0000-\u001F\u007F]/.test(suburb)) return null;
  return { state: value.state, suburb };
}

export function enquiryControls() {
  return {
    Location: new FormControl<EnquiryLocationSelection | null>(null, [Validators.required, control => locationForSubmission(control.value) ? null : { invalidLocation: true }]),
    DiscoverySource: new FormControl('', { nonNullable: true, validators: [Validators.required, control => (ENQUIRY_SOURCE_OPTIONS as readonly string[]).includes(control.value) ? null : { invalidSource: true }] }),
    DiscoverySourceDetail: new FormControl('', { nonNullable: true }),
  };
}

export function enquiryPayload<T extends { Location: EnquiryLocationSelection | null; DiscoverySource: string; DiscoverySourceDetail: string }>(value: T) {
  const { Location, DiscoverySourceDetail, ...fields } = value;
  return {
    ...fields,
    LocationState: Location?.state ?? '',
    LocationSuburb: Location?.suburb.trim() ?? '',
    DiscoverySourceDetail: sourceRequiresDetail(value.DiscoverySource) ? DiscoverySourceDetail.trim() : '',
  };
}
