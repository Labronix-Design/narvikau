import { TestBed } from '@angular/core/testing';
import { CartItem, CartService } from './cart.service';
import { ToastService } from './toast.service';

describe('CartService checkout selections', () => {
  let service: CartService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [{ provide: ToastService, useValue: { showToast: jasmine.createSpy('showToast') } }] });
    service = TestBed.inject(CartService);
  });

  it('stores only the catalogue selection required for server-side checkout resolution', () => {
    const tamperedSelection: Omit<CartItem, 'quantity'> & { price: number } = {
      slug: 'published-product',
      heading: 'Published product',
      variants: [{ variant_type: 'finish', variant_value: 'black' }],
      accessories: [{ slug: 'published-accessory' }],
    });

    expect(service.getCartItems()).toEqual([jasmine.objectContaining({
      slug: 'published-product',
      variants: [{ variant_type: 'finish', variant_value: 'black' }],
      accessories: [{ slug: 'published-accessory' }],
    })]);
    expect(Object.hasOwn(service.getCartItems()[0], 'price')).toBeFalse();
  });

  it('keeps every selected catalogue option while discarding an untrusted legacy amount', () => {
    service.addToCart({
      slug: 'published-product',
      heading: 'Published product',
      variants: [
        { variant_type: 'cab', variant_value: 'double-cab' },
        { variant_type: 'finish', variant_value: 'black' },
      ],
      accessories: [{ slug: 'published-accessory' }],
      // A tampered local-storage value must never become cart state or reach checkout.
      price: 1,
    };
    service.addToCart(tamperedSelection);

    expect(service.getCartItems()[0].variants).toEqual([
      { variant_type: 'cab', variant_value: 'double-cab' },
      { variant_type: 'finish', variant_value: 'black' },
    ]);
    expect(service.getCartItems()[0].accessories).toEqual([{ slug: 'published-accessory' }]);
    expect(Object.hasOwn(service.getCartItems()[0], 'price')).toBeFalse();
  });
});
