// Runs with the installed TypeScript compiler and node:test; no Angular test target is configured.
import '@angular/compiler';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Injector, runInInjectionContext } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder } from '@angular/forms';
import { AdminService, CatalogProduct } from '../../../_services/admin.service';
import { ModalService } from '../../../_services/modal.service';
import { AdminProductsComponent } from './admin-products.component';
import { AdminCategory } from '../../../_services/admin.service';

const canopies: CatalogProduct[] = ['Adventure', 'Overland', 'Sports', 'Defender'].map((model, index) => ({
  id: index + 1,
  slug: `navrik-canopy-${model.toLowerCase()}`,
  name: `Navrik Canopy — ${model}`,
  category: 'canopy',
  specifications: { Material: 'Aluminium', 'Front Door / Window': `${model} window`, 'Vehicle Fit': 'Dual cab' },
  description: `${model} description`,
  image_url: '/canopy.jpg',
  gallery_urls: ['/detail.jpg'],
  is_active: index !== 3,
  sort_order: index + 1,
}));

const categories: AdminCategory[] = [
  { id: 1, slug: 'canopy', name: 'Canopies', description: null, sort_order: 0, is_active: true },
  { id: 2, slug: 'roof-equipment', name: 'Roof Equipment', description: null, sort_order: 1, is_active: true },
  { id: 3, slug: 'retired', name: 'Retired', description: null, sort_order: 2, is_active: false },
];

async function editor(products = canopies, productsError: unknown = null, managed = categories) {
  let stored = [...products];
  const submissions: CatalogProduct[] = [];
  const deleted: number[] = [];
  const service = {
    logout: () => undefined,
    getProducts: async () => {
      if (productsError) throw productsError;
      return stored;
    },
    getCategories: async () => managed,
    createProduct: async (payload: CatalogProduct) => {
      submissions.push(payload);
      stored = [...stored, { ...payload, id: 20 }];
      return { ...payload, id: 20 };
    },
    updateProduct: async (payload: CatalogProduct) => {
      submissions.push(payload);
      stored = stored.map(item => item.id === payload.id ? payload : item);
      return payload;
    },
    deleteProduct: async (id: number) => { deleted.push(id); stored = stored.filter(item => item.id !== id); },
  };
  const injector = Injector.create({ providers: [
    { provide: AdminService, useValue: service },
    { provide: ModalService, useValue: { confirm: async () => true } },
    { provide: FormBuilder, useValue: new FormBuilder() },
  ] });
  const component = runInInjectionContext(injector, () => new AdminProductsComponent());
  await Promise.resolve();
  return { component, submissions, deleted };
}

test('shows the occupied product position, including inactive products, within the selected category', async () => {
  const { component } = await editor();
  component.openCreate();
  component.form.controls.category.setValue('canopy');
  component.categoryChanged();
  assert.equal(component.form.controls.sort_order.value, 5);
  component.form.controls.sort_order.setValue(4);
  assert.equal(component.productPositionOccupant()?.name, canopies[3].name);
  component.form.controls.category.setValue('roof-equipment');
  assert.equal(component.productPositionOccupant(), undefined);
});

test('treats a successful empty catalogue as an informational state', async () => {
  const { component } = await editor([]);

  assert.equal(component.catalogueEmpty(), true);
  assert.equal(component.sessionExpired(), false);
  assert.equal(component.error(), '');
});

test('asks an administrator to sign in again when loading products is unauthorised', async () => {
  const { component } = await editor([], new HttpErrorResponse({ status: 401 }));

  assert.equal(component.catalogueEmpty(), false);
  assert.equal(component.sessionExpired(), true);
  assert.equal(component.error(), '');
});

for (const product of canopies) {
  test(`loads and edits ${product.name} through generic specifications`, async () => {
    const { component, submissions } = await editor();
    assert.equal(component.products().length, 4);
    component.openEdit(product);
    const rows = component.form.controls.specifications;
    assert.deepEqual(rows.getRawValue(), [
      { label: 'Material', value: 'Aluminium' },
      { label: 'Front Door / Window', value: `${product.name.split(' — ')[1]} window` },
      { label: 'Vehicle Fit', value: 'Dual cab' },
    ]);
    rows.at(1).controls.value.setValue('Updated window');
    await component.save();
    assert.equal(submissions[0].id, product.id);
    assert.deepEqual(submissions[0].specifications, {
      Material: 'Aluminium', 'Front Door / Window': 'Updated window', 'Vehicle Fit': 'Dual cab',
    });
    assert.deepEqual(submissions[0].gallery_urls, ['/detail.jpg']);
    assert.equal(submissions[0].image_url, '/canopy.jpg');
    assert.equal(submissions[0].is_active, product.is_active);
    assert.equal(submissions[0].sort_order, product.sort_order);
  });
}

test('creates a product in a new category without canopy or payment payload fields', async () => {
  const { component, submissions } = await editor();
  component.openCreate();
  assert.equal(component.form.controls.name.value, '');
  assert.equal(component.form.controls.slug.value, '');
  assert.equal(component.form.controls.category.value, '');
  component.form.patchValue({ name: ' Roof Rack ', slug: 'roof-rack', category: 'roof-equipment', sort_order: 5 });
  component.addSpecification();
  component.form.controls.specifications.at(0).setValue({ label: ' Load rating ', value: ' 120 kg ' });
  await component.save();
  assert.deepEqual(submissions[0], {
    name: 'Roof Rack', slug: 'roof-rack', category: 'roof-equipment',
    specifications: { 'Load rating': '120 kg' }, description: null, image_url: null,
    gallery_urls: [], is_active: true, sort_order: 5,
  });
  assert.equal(component.products().at(-1)?.name, 'Roof Rack');
  assert.equal(component.showForm(), false);
});

test('only managed active categories are available for a new product', async () => {
  const { component, submissions } = await editor();
  component.openCreate();
  assert.deepEqual(component.activeCategories().map(category => category.slug), ['canopy', 'roof-equipment']);
  component.form.patchValue({ name: 'Rack', slug: 'roof-rack', category: 'retired' });
  await component.save();
  assert.equal(submissions.length, 0);
  component.form.controls.category.setValue('roof-equipment');
  await component.save();
  assert.equal(submissions[0]?.category, 'roof-equipment');
});

test('preserves an inactive current category for editing but prevents resaving it', async () => {
  const { component, submissions } = await editor([{ ...canopies[0], category: 'retired' }]);
  component.openEdit({ ...canopies[0], category: 'retired' });
  assert.equal(component.form.controls.category.value, 'retired');
  assert.equal(component.currentInactiveCategory(), 'retired');
  await component.save();
  assert.equal(submissions.length, 0);
});

for (const label of ['', '   ', '__proto__', 'constructor', 'prototype']) {
  test(`rejects invalid specification label ${JSON.stringify(label)} before saving`, async () => {
    const { component, submissions } = await editor();
    component.openEdit(canopies[0]);
    component.addSpecification();
    component.form.controls.specifications.at(3).setValue({ label, value: 'Text' });
    await component.save();
    assert.equal(submissions.length, 0);
    assert.equal(component.form.invalid, true);
    assert.equal(component.form.touched, true);
  });
}

test('rejects duplicate labels after trimming and removes only the chosen row', async () => {
  const { component, submissions } = await editor();
  component.openEdit(canopies[0]);
  component.addSpecification();
  component.form.controls.specifications.at(3).setValue({ label: ' Material ', value: 'Steel' });
  await component.save();
  assert.equal(submissions.length, 0);
  assert.equal(component.form.controls.specifications.hasError('duplicateLabels'), true);
  component.removeSpecification(3);
  await component.save();
  assert.equal(submissions.length, 1);
  assert.equal(submissions[0].specifications['Material'], 'Aluminium');
});

test('requires generic identity fields and valid category/slug identifiers', async () => {
  const { component, submissions } = await editor();
  component.openCreate();
  for (const fields of [
    { name: ' ', slug: 'roof-rack', category: 'accessory' },
    { name: 'Rack', slug: 'Roof Rack', category: 'accessory' },
    { name: 'Rack', slug: 'roof-rack', category: 'Roof Equipment' },
    { name: 'Rack', slug: 'roof-rack', category: '' },
  ]) {
    component.form.patchValue(fields);
    await component.save();
  }
  assert.equal(submissions.length, 0);
});

test('requires a specification value and limits entries to the API contract', async () => {
  const { component, submissions } = await editor();
  component.openEdit(canopies[0]);
  component.form.controls.specifications.at(0).controls.value.setValue('  ');
  await component.save();
  assert.equal(submissions.length, 0);
  component.form.controls.specifications.at(0).controls.value.setValue('Aluminium');
  for (let index = 3; index < 31; index++) component.addSpecification();
  assert.equal(component.form.controls.specifications.length, 30);
});

test('clears previous rows for a new product and preserves gallery editing and deletion', async () => {
  const { component, submissions, deleted } = await editor();
  component.openEdit(canopies[0]);
  component.addGalleryImage();
  component.updateGalleryImage(1, '/extra.jpg');
  component.removeGalleryImage(0);
  await component.save();
  assert.deepEqual(submissions[0].gallery_urls, ['/extra.jpg']);
  component.openCreate();
  assert.deepEqual(component.form.controls.specifications.getRawValue(), []);
  assert.deepEqual(component.form.controls.gallery_urls.value, []);
  await component.remove(canopies[0]);
  assert.deepEqual(deleted, [1]);
  assert.equal(component.products().length, 3);
});

test('keeps the primary cover separate from unique additional gallery images when saving', async () => {
  const { component, submissions } = await editor();
  component.openEdit(canopies[0]);
  component.form.controls.image_url.setValue('/cover.jpg');
  component.form.controls.gallery_urls.setValue(['/cover.jpg', '/side.jpg', '/side.jpg', '/rear.jpg', '']);

  await component.save();

  assert.equal(submissions[0].image_url, '/cover.jpg');
  assert.deepEqual(submissions[0].gallery_urls, ['/side.jpg', '/rear.jpg']);
});
