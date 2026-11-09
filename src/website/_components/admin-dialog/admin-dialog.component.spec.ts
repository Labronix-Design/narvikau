import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { AdminDialogComponent } from './admin-dialog.component';

@Component({
  standalone: true,
  imports: [AdminDialogComponent, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button id="dialog-trigger" (click)="open.set(true)">Edit record</button>
    @if (mounted()) {
      <website-admin-dialog [open]="open()" title="Edit record" [description]="description()"
        [busy]="busy()" [closeDisabled]="closeDisabled()" (closed)="onClose()">
        <form id="record-form" [formGroup]="form" (ngSubmit)="saves = saves + 1">
          <label for="record-name">Name</label>
          <input id="record-name" formControlName="name">
        </form>
        <button adminDialogActions type="submit" form="record-form">Save record</button>
      </website-admin-dialog>
    }
  `,
})
class DialogHostComponent {
  readonly open = signal(false);
  readonly mounted = signal(true);
  readonly busy = signal(false);
  readonly closeDisabled = signal(false);
  readonly description = signal('Update the selected record.');
  readonly form = new FormGroup({ name: new FormControl('Original', { nonNullable: true }) });
  closes = 0;
  saves = 0;

  onClose(): void {
    this.closes++;
    this.open.set(false);
  }
}

describe('AdminDialogComponent', () => {
  let fixture: ComponentFixture<DialogHostComponent>;
  let host: DialogHostComponent;
  let previousOverflow: string;
  let previousPriority: string;

  const dialog = (): HTMLElement => fixture.nativeElement.querySelector('[role="dialog"]');
  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }
  async function open(): Promise<void> {
    const trigger: HTMLButtonElement = fixture.nativeElement.querySelector('#dialog-trigger');
    trigger.focus();
    trigger.click();
    await render();
  }

  beforeEach(async () => {
    previousOverflow = document.body.style.getPropertyValue('overflow');
    previousPriority = document.body.style.getPropertyPriority('overflow');
    await TestBed.configureTestingModule({ imports: [DialogHostComponent] }).compileComponents();
    fixture = TestBed.createComponent(DialogHostComponent);
    host = fixture.componentInstance;
    await render();
  });

  afterEach(() => {
    fixture.destroy();
    if (previousOverflow) document.body.style.setProperty('overflow', previousOverflow, previousPriority);
    else document.body.style.removeProperty('overflow');
  });

  it('renders only when open, connects its labels and captures focus inside the dialog', async () => {
    expect(dialog()).toBeNull();
    await open();
    const element = dialog();
    expect(element.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(element.getAttribute('aria-labelledby')!)?.textContent?.trim()).toBe('Edit record');
    expect(document.getElementById(element.getAttribute('aria-describedby')!)?.textContent?.trim()).toBe('Update the selected record.');
    expect(element.contains(document.activeElement)).toBeTrue();
    host.description.set('');
    await render();
    expect(dialog().hasAttribute('aria-describedby')).toBeFalse();
  });

  it('wraps focus at both trap boundaries and restores the invoking button after Escape', async () => {
    await open();
    const anchors = fixture.nativeElement.querySelectorAll('.cdk-focus-trap-anchor') as NodeListOf<HTMLElement>;
    anchors[1].focus();
    expect(dialog().contains(document.activeElement)).toBeTrue();
    anchors[0].focus();
    expect(document.activeElement?.textContent?.trim()).toBe('Save record');
    dialog().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await render();
    expect(host.closes).toBe(1);
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('#dialog-trigger'));
  });

  it('ignores content clicks but closes for the backdrop or close button', async () => {
    await open();
    fixture.nativeElement.querySelector('#record-name').click();
    expect(host.closes).toBe(0);
    fixture.nativeElement.querySelector('.adlg-overlay').click();
    await render();
    expect(host.closes).toBe(1);
    await open();
    fixture.nativeElement.querySelector('.adlg-close').click();
    await render();
    expect(host.closes).toBe(2);
  });

  for (const blockedBy of ['busy', 'closeDisabled'] as const) {
    it(`blocks Escape, backdrop and the close button while ${blockedBy}`, async () => {
      host[blockedBy].set(true);
      await open();
      expect(fixture.nativeElement.querySelector('.adlg-close').disabled).toBeTrue();
      if (blockedBy === 'busy') expect(dialog().getAttribute('aria-busy')).toBe('true');
      dialog().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.nativeElement.querySelector('.adlg-overlay').click();
      fixture.nativeElement.querySelector('.adlg-close').click();
      await render();
      expect(host.closes).toBe(0);
      expect(dialog()).not.toBeNull();
      host[blockedBy].set(false);
      await render();
      dialog().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await render();
      expect(host.closes).toBe(1);
    });
  }

  it('restores the exact body overflow after close, reopening and destruction', async () => {
    document.body.style.setProperty('overflow', 'scroll', 'important');
    await open();
    expect(document.body.style.overflow).toBe('hidden');
    host.open.set(false);
    await render();
    expect(document.body.style.overflow).toBe('scroll');
    expect(document.body.style.getPropertyPriority('overflow')).toBe('important');
    await open();
    host.mounted.set(false);
    await render();
    expect(document.body.style.overflow).toBe('scroll');
    expect(document.body.style.getPropertyPriority('overflow')).toBe('important');
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('#dialog-trigger'));
  });

  it('keeps scrolling locked until the last open dialog closes', async () => {
    document.body.style.removeProperty('overflow');
    await open();
    const second = TestBed.createComponent(AdminDialogComponent);
    try {
      second.componentRef.setInput('title', 'Another record');
      second.componentRef.setInput('open', true);
      second.detectChanges();
      await second.whenStable();
      host.open.set(false);
      await render();
      expect(document.body.style.overflow).toBe('hidden');
    } finally {
      second.destroy();
    }
    expect(document.body.style.getPropertyValue('overflow')).toBe('');
  });

  it('allows the page to close after saving while busy without emitting a dismissal', async () => {
    await open();
    host.busy.set(true);
    await render();
    host.open.set(false);
    await render();
    expect(dialog()).toBeNull();
    expect(host.closes).toBe(0);
    expect(document.body.style.overflow).toBe(previousOverflow);
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('#dialog-trigger'));
  });

  it('retains page-owned form state and submits the projected footer action', async () => {
    await open();
    const field: HTMLInputElement = fixture.nativeElement.querySelector('#record-name');
    field.value = 'Updated';
    field.dispatchEvent(new Event('input'));
    fixture.nativeElement.querySelector('.adlg-footer button').click();
    await render();
    expect(host.form.controls.name.value).toBe('Updated');
    expect(host.saves).toBe(1);
    host.open.set(false);
    await render();
    await open();
    expect((fixture.nativeElement.querySelector('#record-name') as HTMLInputElement).value).toBe('Updated');
  });
});
