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

  it('submits the exact selected canopy as a canopy quote request', async () => {
    component.preSelectedProduct = 'Navrik Canopy — Adventure';
    component.quoteForm.setValue({ Name: 'Alex', Phone: '0412345678', Email: 'alex@example.test', Message: 'Please confirm fitment.' });
    const fetchSpy = spyOn(window, 'fetch').and.resolveTo(new Response('', { status: 200 }));

    await component.onSubmit();

    const [, init] = fetchSpy.calls.mostRecent().args;
    const payload = JSON.parse(init?.body as string);
    expect(payload.Type).toBe('Canopy Quote Request');
    expect(payload.Product).toBe('Navrik Canopy — Adventure');
    expect(payload.Message).toBe('Please confirm fitment.');
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
