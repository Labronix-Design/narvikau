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

  it('formats cent amounts as South African Rand', () => {
    fixture.componentRef.setInput('label', 'Revenue');
    fixture.componentRef.setInput('value', 123456);
    fixture.componentRef.setInput('format', 'currency');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('R1,234.56');
  });

  it('does not render an unexpected object as dashboard text', () => {
    fixture.componentRef.setInput('label', 'Search comparison');
    fixture.componentRef.setInput('value', { clicks: 24 });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Not measured yet');
    expect(fixture.nativeElement.textContent).not.toContain('[object Object]');
  });
});
