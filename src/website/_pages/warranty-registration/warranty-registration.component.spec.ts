import { TestBed } from '@angular/core/testing';
import { WarrantyRegistrationPage } from './warranty-registration.component';

describe('WarrantyRegistrationPage', () => {
  it('submits the standalone warranty allowlist without an order token', async () => {
    await TestBed.configureTestingModule({ imports: [WarrantyRegistrationPage] }).compileComponents();
    const fixture = TestBed.createComponent(WarrantyRegistrationPage);
    const page = fixture.componentInstance;
    let submittedBody: unknown;
    spyOn(window, 'fetch').and.callFake(async (_url, init) => {
      submittedBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ ok: true, registrationReference: 'WTY-AU-1042' }), { status: 201 });
    });

    (page.form as unknown as { patchValue(value: Record<string, unknown>): void }).patchValue({
      purchaserName: 'Avery Customer',
      purchaserEmail: 'avery@example.test',
      purchaserPhone: '+61 412 345 678',
      productName: 'Navrik Canopy Adventure',
      purchaseReference: 'AU-INV-1042',
      vehicleMake: 'Toyota',
      vehicleModel: 'Hilux',
      vehicleYear: 2024,
      vehicleRegistration: 'ABC 123',
      purchaseDate: '2026-08-15',
      fitmentDate: '2026-08-20',
      consent: true,
    });

    await page.submit();

    expect(submittedBody).toEqual({
      purchaserName: 'Avery Customer',
      purchaserEmail: 'avery@example.test',
      purchaserPhone: '+61 412 345 678',
      productName: 'Navrik Canopy Adventure',
      purchaseReference: 'AU-INV-1042',
      vehicleMake: 'Toyota',
      vehicleModel: 'Hilux',
      vehicleYear: 2024,
      vehicleRegistration: 'ABC 123',
      purchaseDate: '2026-08-15',
      fitmentDate: '2026-08-20',
      consent: true,
    });
    expect(page.registrationReference).toBe('WTY-AU-1042');
  });
});
