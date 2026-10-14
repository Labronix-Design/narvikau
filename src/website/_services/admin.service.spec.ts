import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AdminCategory, AdminService } from './admin.service';

describe('AdminService category API', () => {
  let service: AdminService;
  let http: HttpTestingController;
  const category: AdminCategory = { id: 1, slug: 'canopy', name: 'Canopies', description: null, sort_order: 0, is_active: true };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AdminService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads all managed categories from the authenticated endpoint', async () => {
    const result = service.getCategories();
    const request = http.expectOne('/api/admin-categories');
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.has('Authorization')).toBeTrue();
    request.flush([category]);
    expect(await result).toEqual([category]);
  });

  it('writes and deletes categories using the matching HTTP methods', async () => {
    const { id, ...input } = category;
    const created = service.createCategory(input);
    const post = http.expectOne('/api/admin-categories');
    expect(post.request.method).toBe('POST');
    post.flush(category);
    expect(await created).toEqual(category);
    const updated = service.updateCategory({ ...category, name: 'Canopy Systems', created_at: '2026-10-14T00:00:00Z' } as AdminCategory);
    const put = http.expectOne('/api/admin-categories');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ ...category, name: 'Canopy Systems' });
    put.flush({ ...category, name: 'Canopy Systems' });
    expect((await updated).name).toBe('Canopy Systems');
    const deleted = service.deleteCategory(1);
    const remove = http.expectOne('/api/admin-categories');
    expect(remove.request.method).toBe('DELETE');
    expect(remove.request.body).toEqual({ id: 1 });
    remove.flush({ ok: true });
    expect(await deleted).toEqual({ ok: true });
  });
});
