import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ToastService } from './toast.service';

export interface CartItem {
  slug: string;
  heading: string;
  variants: Array<{ variant_type: string; variant_value: string }>;
  accessories: Array<{ slug: string }>;
  tags?: string[];
  accentColor?: string;
  image?: string | null;
  quantity: number;
}

const CART_KEY = 'navrik_cart_v1';

type CartSelection = Pick<CartItem, 'slug' | 'variants' | 'accessories'>;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * The cart is browser storage, not a catalogue record. Retain only a valid
 * catalogue selection and harmless display metadata; the checkout endpoint
 * resolves availability and every amount again from the database.
 */
function normaliseCartItem(value: unknown): CartItem | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<CartItem>;
  if (!isNonEmptyString(candidate.slug)) return null;

  const variants = Array.isArray(candidate.variants)
    ? candidate.variants.filter((variant): variant is { variant_type: string; variant_value: string } =>
      !!variant && isNonEmptyString(variant.variant_type) && isNonEmptyString(variant.variant_value)
    ).map((variant) => ({ variant_type: variant.variant_type.trim(), variant_value: variant.variant_value.trim() }))
    : [];
  const accessories = Array.isArray(candidate.accessories)
    ? candidate.accessories.filter((accessory): accessory is { slug: string } =>
      !!accessory && isNonEmptyString(accessory.slug)
    ).map((accessory) => ({ slug: accessory.slug.trim() }))
    : [];
  const quantity = Number.isSafeInteger(candidate.quantity) && candidate.quantity! > 0 ? candidate.quantity! : 1;

  return {
    slug: candidate.slug.trim(),
    heading: isNonEmptyString(candidate.heading) ? candidate.heading.trim() : candidate.slug.trim(),
    variants,
    accessories,
    ...(Array.isArray(candidate.tags) ? { tags: candidate.tags.filter(isNonEmptyString) } : {}),
    ...(isNonEmptyString(candidate.accentColor) ? { accentColor: candidate.accentColor } : {}),
    ...(isNonEmptyString(candidate.image) ? { image: candidate.image } : {}),
    quantity,
  };
}

function selectionKey(selection: CartSelection): string {
  return JSON.stringify({
    slug: selection.slug,
    variants: [...selection.variants]
      .map((variant) => ({ variant_type: variant.variant_type, variant_value: variant.variant_value }))
      .sort((left, right) => `${left.variant_type}\u0000${left.variant_value}`.localeCompare(`${right.variant_type}\u0000${right.variant_value}`)),
    accessories: [...selection.accessories]
      .map((accessory) => ({ slug: accessory.slug }))
      .sort((left, right) => left.slug.localeCompare(right.slug)),
  });
}

@Injectable({
  providedIn: 'root'
})
export class CartService {
  private toast = inject(ToastService);

  private cart = new BehaviorSubject<CartItem[]>(this.loadFromStorage());
  public cart$: Observable<CartItem[]> = this.cart.asObservable();

  private isCartOpen = new BehaviorSubject<boolean>(false);
  public isCartOpen$: Observable<boolean> = this.isCartOpen.asObservable();

  private loadFromStorage(): CartItem[] {
    try {
      const raw = localStorage.getItem(CART_KEY);
      const stored = raw ? JSON.parse(raw) : [];
      return Array.isArray(stored)
        ? stored.map(normaliseCartItem).filter((item): item is CartItem => item !== null)
        : [];
    } catch {
      return [];
    }
  }

  private persist(items: CartItem[]): void {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(items));
    } catch {}
  }

  getCartItemCount(): Observable<number> {
    return this.cart$.pipe(
      map(items => items.reduce((acc, item) => acc + item.quantity, 0))
    );
  }

  getCartItems(): CartItem[] { return this.cart.getValue(); }

  toggleCart(): void { this.isCartOpen.next(!this.isCartOpen.getValue()); }
  openCart(): void { this.isCartOpen.next(true); }
  closeCart(): void { this.isCartOpen.next(false); }

  clearCart(): void {
    this.cart.next([]);
    try { localStorage.removeItem(CART_KEY); } catch {}
  }

  addToCart(item: Omit<CartItem, 'quantity'>): void {
    const normalised = normaliseCartItem({ ...item, quantity: 1 });
    if (!normalised) return;
    const current = this.getCartItems();
    const key = selectionKey(normalised);
    const existing = current.find((entry) => selectionKey(entry) === key);
    const next = existing
      ? current.map((entry) => selectionKey(entry) === key ? { ...entry, quantity: entry.quantity + 1 } : entry)
      : [...current, normalised];
    this.cart.next(next);
    this.persist(next);
    this.toast.showToast({ message: `${normalised.heading} added to cart!`, type: 'success' });
    this.openCart();
  }

  updateQuantity(selection: CartSelection, delta: number): void {
    const key = selectionKey(selection);
    const next = this.getCartItems()
      .map((item) => selectionKey(item) === key ? { ...item, quantity: item.quantity + delta } : item)
      .filter((item) => {
        if (selectionKey(item) === key && item.quantity <= 0) {
          this.toast.showToast({ message: 'Item removed from cart.', type: 'warning' });
          return false;
        }
        return true;
      });
    this.cart.next(next);
    this.persist(next);
  }

  removeFromCart(selection: CartSelection): void {
    const key = selectionKey(selection);
    const next = this.getCartItems().filter((item) => selectionKey(item) !== key);
    this.cart.next(next);
    this.persist(next);
    this.toast.showToast({ message: 'Item removed from cart.', type: 'warning' });
  }

  getTotalItemsCount(): number {
    return this.getCartItems().reduce((acc, item) => acc + item.quantity, 0);
  }
}
