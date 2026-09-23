import { Component, inject, ChangeDetectionStrategy, OnInit, ViewChild, ChangeDetectorRef } from '@angular/core';
import { CommonModule, AsyncPipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { CartService, CartItem } from '../../_services/cart.service';
import { ToastService } from '../../_services/toast.service';
import { GoogleReviewsService } from '../../_services/google.service';

import { MatIconModule } from '@angular/material/icon';
import { ButtonComponent } from '../button/button.component';
import { TextInputComponent } from '../text-input/text-input.component';
import { PageLoaderComponent } from '../page-loader/page-loader.component';
import { FeatureFlagsService } from '../../_services/feature-flags.service';
import { SiteSettingsService } from '../../_services/site-settings.service';

@Component({
  selector: 'website-cart',
  templateUrl: './cart.component.html',
  styleUrls: ['./cart.component.scss'],
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, RouterModule,
    MatIconModule, ButtonComponent, TextInputComponent,
    PageLoaderComponent, AsyncPipe
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CartComponent implements OnInit {
  public cartService = inject(CartService);
  public flags = inject(FeatureFlagsService);
  public siteSettings = inject(SiteSettingsService);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private googleService = inject(GoogleReviewsService);
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);

  // Grab a reference to the loader to trigger its exit animation
  @ViewChild(PageLoaderComponent) pageLoader?: PageLoaderComponent;

  cartItems$ = this.cartService.cart$;
  isOpen$ = this.cartService.isCartOpen$;

  inCheckout = false;
  submitted = false;
  isLoading = false;
  paymentMode: 'deposit' | 'full' = 'deposit';

  paymentResult: 'success' | 'success-full' | 'test-success' | 'cancel' | 'failed' | null = null;

  checkoutForm = this.fb.nonNullable.group({
    Name:         ['', [Validators.required, Validators.minLength(2)]],
    Email:        ['', [Validators.required, Validators.email]],
    Phone:        ['', [Validators.required]],
    Requirements: ['', [Validators.required]],
    VoucherCode:  [''],
  });

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      const status = params['payment'];
      const mode   = params['mode'];

      if (status === 'success') {
        this.cartService.clearCart();
        const type = params['type'];
        if (mode === 'test') this.paymentResult = 'test-success';
        else if (type === 'full') this.paymentResult = 'success-full';
        else this.paymentResult = 'success';
        // A return URL is not payment confirmation. The verified, idempotent
        // Yoco webhook is the sole authority for any future purchase event.
        this.googleService.trackEvent('payment_return', { payment_mode: type === 'full' ? 'full' : 'deposit' });
        this.cleanUrl();
        this.cdr.markForCheck();
      } else if (status === 'cancel') {
        this.paymentResult = 'cancel';
        this.cleanUrl();
        this.cdr.markForCheck();
      } else if (status === 'failed') {
        this.paymentResult = 'failed';
        this.cleanUrl();
        this.cdr.markForCheck();
      }
    });
  }

  closePaymentResult(): void {
    this.paymentResult = null;
    this.cdr.markForCheck();
  }

  retryPayment(): void {
    this.paymentResult = null;
    this.cartService.openCart();
    this.cdr.markForCheck();
  }

  private cleanUrl() {
    this.router.navigate([], { queryParams: { payment: null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  get itemCountLabel(): string {
    const count = this.cartService.getTotalItemsCount();
    return `${count} Item${count === 1 ? '' : 's'} Selected`;
  }

  toggleCart(): void { this.cartService.toggleCart(); }
  getItemDelay(index: number): string { return `${index * 0.05}s`; }

  increaseQuantity(item: CartItem): void {
    this.cartService.updateQuantity(item, 1);
  }
  
  decreaseQuantity(item: CartItem): void {
    this.cartService.updateQuantity(item, -1);
    if (this.cartService.getCartItems().length === 0) this.inCheckout = false;
  }
  
  removeItem(item: CartItem): void {
    this.googleService.trackButtonClick('CartItemRemoved', item.heading);
    this.cartService.removeFromCart(item);
    if (this.cartService.getCartItems().length === 0) this.inCheckout = false;
  }

  enterCheckout(): void {
    if (this.cartService.getCartItems().length > 0) {
      this.inCheckout = true;
      this.googleService.trackEvent('begin_checkout', { payment_mode: this.paymentMode });
    } else {
      this.toast.showToast({ message: 'Your cart is empty.', type: 'warning' });
    }
  }

  // Gracefully animate the loader away if an error occurs
  private closeLoader() {
    if (this.pageLoader) {
      this.pageLoader.triggerExit();
      setTimeout(() => {
        this.isLoading = false;
        this.cdr.markForCheck(); // Tell Angular to update the UI
      }, 600); // Matches your CSS fade-out transition duration
    } else {
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  async processCheckout(): Promise<void> {
    this.submitted = true;

    if (this.checkoutForm.invalid) {
      const firstError = Object.keys(this.checkoutForm.controls).find(k => (this.checkoutForm.controls as any)[k].invalid);
      this.googleService.trackSystemError('CheckoutValidationError', `Field: ${firstError}`);
      this.toast.showToast({ message: 'Please check your delivery details.', type: 'warning' });
      return;
    }

    const items = this.cartService.getCartItems();
    // ACTIVATE FULL PAGE LOADER
    this.isLoading = true;
    
    const formVal = this.checkoutForm.getRawValue();

    const cartItems = items.flatMap((item) => Array.from({ length: item.quantity }, () => ({
      slug: item.slug,
      variants: item.variants,
      accessories: item.accessories,
    })));

    const { VoucherCode, ...customerFields } = formVal;
    const payload = {
      payFullAmount: this.paymentMode === 'full',
      customerData: customerFields,
      cartItems,
      voucherCode: VoucherCode?.trim() || '',
    };

    try {
      const response: any = await firstValueFrom(this.http.post('/api/create-checkout', payload));
      if (response.success && response.redirectUrl) { 
        // DO NOT close the loader here! Keep it spinning while the browser redirects to Yoco!
        window.location.href = response.redirectUrl; 
      } else { 
        throw new Error(response.message || 'Failed to generate checkout link'); 
      }
    } catch (error: any) {
      this.googleService.trackSystemError('YocoCheckoutFailure', error.message);
      this.toast.showToast({ message: 'Payment gateway unavailable. Please try again.', type: 'error' });
      // Fade the loader away so the user can try again
      this.closeLoader();
    }
  }
}
