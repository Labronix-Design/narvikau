import { 
  Component, ElementRef, Input, ViewChild, Output, 
  EventEmitter, inject, signal, computed, booleanAttribute 
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { GoogleReviewsService } from '../../_services/google.service';

@Component({
  selector: 'website-button',
  templateUrl: './button.component.html',
  styleUrls: ['./button.component.scss'],
  standalone: true, 
  imports: [CommonModule, MatIconModule]
})
export class ButtonComponent {
  @Input() label: string = '';
  @Input() ariaLabel: string = '';
  @Input() trackingData: string = '';
  @Input() buttonText: string = '';
  @Input() class: string = ''; 
  @Input() style: string = '';
  @Input() type: string = 'button';
  @Input() id: string = '';
  @Input() isLoading: boolean = false;
  @Input() loadingText: string = '';
  
  // FIX: Added disabled input binding
  @Input({ transform: booleanAttribute }) disabled: boolean = false; 
  
  @Output() buttonClick = new EventEmitter<Event>();

  @ViewChild('buttonElement') buttonElement!: ElementRef<HTMLElement>;

  private googleService = inject(GoogleReviewsService);
  private isClickAnimating = signal(false);

  public isVisualAnimating = computed(() => this.isLoading || this.isClickAnimating());

  clickAnimation(event: MouseEvent) {
    if (this.isLoading || this.disabled || this.isClickAnimating()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const trackLabel = this.label || this.buttonText || 'unlabeled_action';
    this.googleService.trackButtonClick(trackLabel, this.trackingData);

    this.isClickAnimating.set(true);
    this.buttonClick.emit(event);

    setTimeout(() => {
      this.isClickAnimating.set(false);
    }, 400); // Shortened for a faster, mechanical reset
  }
}