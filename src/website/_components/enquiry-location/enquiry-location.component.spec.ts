import { TestBed } from '@angular/core/testing';
import { FormControl, FormGroup } from '@angular/forms';
import { EnquiryLocationComponent } from './enquiry-location.component';
import { locationForSubmission } from '../../_models/enquiry-location.models';
import { sourceDetailRequiredValidator } from '../../_models/enquiry-source.models';

describe('AU enquiry fields', () => {
  it('accepts an Australian state and trims the locality, rejecting invalid selections', () => {
    expect(locationForSubmission({ state: 'Victoria', suburb: ' Richmond ' })).toEqual({ state: 'Victoria', suburb: 'Richmond' });
    expect(locationForSubmission({ state: 'Gauteng', suburb: 'Richmond' })).toBeNull();
    expect(locationForSubmission({ state: 'Victoria', suburb: ' ' })).toBeNull();
    expect(locationForSubmission({ state: 'Victoria', suburb: 'a'.repeat(161) })).toBeNull();
  });

  it('emits a complete selection and propagates disabled/reset state', () => {
    const component = TestBed.createComponent(EnquiryLocationComponent).componentInstance;
    const changed = jasmine.createSpy('changed');
    component.registerOnChange(changed);
    component.updateState({ target: { value: 'Queensland' } } as unknown as Event);
    expect(changed).toHaveBeenCalledWith(null);
    component.updateSuburb({ target: { value: ' Brisbane ' } } as unknown as Event);
    expect(changed).toHaveBeenCalledWith({ state: 'Queensland', suburb: 'Brisbane' });
    component.setDisabledState(true);
    expect(component.disabled()).toBeTrue();
    component.writeValue(null);
    expect(component.state()).toBe('');
  });

  it('requires nonblank referral detail only for the conditional sources', () => {
    const form = new FormGroup({ DiscoverySource: new FormControl('Referral'), DiscoverySourceDetail: new FormControl(' ') }, sourceDetailRequiredValidator);
    expect(form.hasError('discoverySourceDetailRequired')).toBeTrue();
    form.controls.DiscoverySourceDetail.setValue('Customer recommendation');
    expect(form.valid).toBeTrue();
    form.controls.DiscoverySource.setValue('Google Search');
    form.controls.DiscoverySourceDetail.setValue('');
    expect(form.valid).toBeTrue();
  });
});
