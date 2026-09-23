import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ControlMetricComponent } from './control-metric.component';

describe('ControlMetricComponent', () => {
  let fixture: ComponentFixture<ControlMetricComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ControlMetricComponent] }).compileComponents();
    fixture = TestBed.createComponent(ControlMetricComponent);
  });

  it('shows an unavailable measurement plainly instead of a numeric placeholder', () => {
    fixture.componentRef.setInput('label', 'Website conversions');
    fixture.componentRef.setInput('value', null);
    fixture.componentRef.setInput('unavailableReason', 'Conversion tracking has not been connected.');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Not measured yet');
    expect(fixture.nativeElement.textContent).toContain('Conversion tracking has not been connected.');
  });

  it('formats measured counts using the Australian locale', () => {
    fixture.componentRef.setInput('label', 'Enquiries');
    fixture.componentRef.setInput('value', 123456);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('123,456');
  });

  it('does not render an unexpected object as dashboard text', () => {
    fixture.componentRef.setInput('label', 'Search comparison');
    fixture.componentRef.setInput('value', { clicks: 24 });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Not measured yet');
    expect(fixture.nativeElement.textContent).not.toContain('[object Object]');
  });
});
