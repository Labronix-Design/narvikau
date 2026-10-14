import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ImageUploadComponent } from './image-upload.component';
import { AdminService } from '../../_services/admin.service';

describe('ImageUploadComponent', () => {
  let component: ImageUploadComponent;
  let uploadImage: jasmine.Spy;
  let fixture: ComponentFixture<ImageUploadComponent>;

  beforeEach(async () => {
    uploadImage = jasmine.createSpy('uploadImage').and.resolveTo({ url: '/uploads/photo.webp' });
    await TestBed.configureTestingModule({
      imports: [ImageUploadComponent],
      providers: [{ provide: AdminService, useValue: { uploadImage } }],
    }).compileComponents();
    fixture = TestBed.createComponent(ImageUploadComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('offers only the image formats accepted by the upload endpoint', () => {
    const input = fixture.nativeElement.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.accept).toBe('image/jpeg,image/png,image/webp');
    expect(fixture.nativeElement.textContent).toContain('JPEG, PNG, WebP');
  });

  it('opens the native picker from a keyboard-focusable button', () => {
    const input = fixture.nativeElement.querySelector('input[type="file"]') as HTMLInputElement;
    const pick = fixture.nativeElement.querySelector('button.pick-file') as HTMLButtonElement;
    const openPicker = spyOn(input, 'click');
    expect(pick.tabIndex).toBeGreaterThanOrEqual(0);
    pick.click();
    expect(openPicker).toHaveBeenCalledTimes(1);
  });

  for (const type of ['image/svg+xml', 'image/gif', 'application/octet-stream']) {
    it(`rejects ${type} without uploading`, async () => {
      await component.handleFile(new File(['invalid'], 'invalid.img', { type }));
      expect(uploadImage).not.toHaveBeenCalled();
      expect(component.error()).toContain('JPEG, PNG, or WebP');
    });
  }

  it('rejects a file above 4 MiB without uploading', async () => {
    await component.handleFile(new File([new Uint8Array(4 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }));
    expect(uploadImage).not.toHaveBeenCalled();
    expect(component.error()).toContain('4 MiB');
  });

  it('uploads WebP and emits its returned URL', async () => {
    const file = new File(['RIFFxxxxWEBP'], 'photo.webp', { type: 'image/webp' });
    const changed = jasmine.createSpy('urlChange');
    component.urlChange.subscribe(changed);
    await component.handleFile(file);
    expect(uploadImage).toHaveBeenCalledOnceWith(file);
    expect(changed).toHaveBeenCalledOnceWith('/uploads/photo.webp');
    expect(component.error()).toBeNull();
  });

  it('shows a bounded server validation message', async () => {
    const reason = 'Image data does not match the selected image type.';
    uploadImage.and.rejectWith(new HttpErrorResponse({ status: 400, error: { error: reason } }));
    await component.handleFile(new File(['image'], 'photo.webp', { type: 'image/webp' }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.upload-err')?.textContent).toContain(reason);

    uploadImage.and.rejectWith(new HttpErrorResponse({ status: 400, error: { error: 'x'.repeat(500) } }));
    await component.handleFile(new File(['image'], 'photo.webp', { type: 'image/webp' }));
    expect(component.error()!.length).toBeLessThanOrEqual(160);
  });
});
