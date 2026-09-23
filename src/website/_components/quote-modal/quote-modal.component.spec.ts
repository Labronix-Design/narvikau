import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { QuoteModalComponent } from './quote-modal.component';
import { FeatureFlagsService } from '../../_services/feature-flags.service';
import { SiteSettingsService } from '../../_services/site-settings.service';
import { ToastService } from '../../_services/toast.service';

describe('QuoteModalComponent', () => {
  let fixture: ComponentFixture<QuoteModalComponent>;
  let component: QuoteModalComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QuoteModalComponent],
      providers: [
        { provide: FeatureFlagsService, useValue: { emailsEnabled: true } },
        { provide: SiteSettingsService, useValue: { settings: signal({ contact: { email: 'sales@example.test' } }) } },
        { provide: ToastService, useValue: { showToast: jasmine.createSpy('showToast') } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(QuoteModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('includes the selected configuration in the submitted quote message', async () => {
    component.preSelectedProduct = 'Quote product';
    component.configuration = {
      variants: [{ label: 'Finish', value: 'Black powder coat' }],
      accessories: ['Rear guard'],
    };
    component.quoteForm.setValue({ Name: 'Alex', Phone: '0712345678', Email: 'alex@example.test', Message: 'Please include fitment.' });
    const fetchSpy = spyOn(window, 'fetch').and.resolveTo(new Response('', { status: 200 }));

    await component.onSubmit();

    const [, init] = fetchSpy.calls.mostRecent().args;
    const payload = JSON.parse(init?.body as string);
    expect(payload.Message).toContain('Finish: Black powder coat');
    expect(payload.Message).toContain('Accessories: Rear guard');
    expect(payload.Message).toContain('Please include fitment.');
  });

  it('focuses within the dialog and restores the triggering focus after Escape', async () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    const closeSpy = jasmine.createSpy('close');
    component.closeModal.subscribe(closeSpy);

    component.isOpen = true;
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('.qm-close'));

    component.onEscape(new KeyboardEvent('keydown', { key: 'Escape' }));
    component.isOpen = false;
    fixture.detectChanges();
    await Promise.resolve();

    expect(closeSpy).toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
