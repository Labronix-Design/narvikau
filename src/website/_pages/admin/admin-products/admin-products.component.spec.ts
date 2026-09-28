// Runs with the installed TypeScript compiler and node:test; no Angular test target is configured.
import '@angular/compiler';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Injector, runInInjectionContext } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { AdminService, CatalogProduct } from '../../../_services/admin.service';
import { ModalService } from '../../../_services/modal.service';
import { AdminProductsComponent } from './admin-products.component';

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
  sort_order: index,
}));

async function editor(products = canopies) {
  const submissions: CatalogProduct[] = [];
  const deleted: number[] = [];
  const service = {
    getProducts: async () => products,
    createProduct: async (payload: CatalogProduct) => {
      submissions.push(payload);
      return { ...payload, id: 20 };
    },
    updateProduct: async (payload: CatalogProduct) => {
      submissions.push(payload);
      return payload;
    },
    deleteProduct: async (id: number) => { deleted.push(id); },
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
