import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ControlStateComponent } from './control-state.component';

describe('ControlStateComponent', () => {
  let fixture: ComponentFixture<ControlStateComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ControlStateComponent] }).compileComponents();
    fixture = TestBed.createComponent(ControlStateComponent);
  });

  it('uses skeleton blocks while data is loading', () => {
    fixture.componentRef.setInput('state', 'loading');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.control-skeleton').length).toBeGreaterThan(0);
  });

  it('explains the next step for integration setup', () => {
    fixture.componentRef.setInput('state', 'setup');
    fixture.componentRef.setInput('title', 'Connect Search Console');
    fixture.componentRef.setInput('message', 'An administrator must complete the secure Google connection.');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Connect Search Console');
    expect(fixture.nativeElement.textContent).toContain('secure Google connection');
  });
});
