import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { AdminService } from '../../_services/admin.service';

@Component({
  selector: 'website-image-upload',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './image-upload.component.html',
  styleUrls: ['./image-upload.component.scss'],
})
export class ImageUploadComponent {
  @Input() url: string | null | undefined = '';
  @Input() compact = false;
  @Output() urlChange = new EventEmitter<string>();

  isDragging = signal(false);
  isUploading = signal(false);
  error = signal<string | null>(null);

  constructor(private adminService: AdminService) {}

  get previewSrc(): string {
    return this.url || '';
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) this.handleFile(file);
  }

  onFileInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.handleFile(file);
    input.value = '';
  }

  async handleFile(file: File): Promise<void> {
    this.error.set(null);

    if (!file.type.startsWith('image/')) {
      this.error.set('Please choose an image file (JPEG, PNG, WebP, GIF, or SVG).');
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      this.error.set('Image must be under 4MB.');
      return;
    }

    this.isUploading.set(true);
    try {
      const { url } = await this.adminService.uploadImage(file);
      this.url = url;
      this.urlChange.emit(url);
    } catch {
      this.error.set('Upload failed — please try again.');
    } finally {
      this.isUploading.set(false);
    }
  }

  clearImage(): void {
    this.url = '';
    this.urlChange.emit('');
  }
}
