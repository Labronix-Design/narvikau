import { inject } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

/** Handles a server-rejected admin session consistently across every admin page. */
export const adminSessionInterceptor: HttpInterceptorFn = (request, next) => {
  const router = inject(Router);
  return next(request).pipe(catchError(error => {
    const isAdminApi = request.url.startsWith('/api/admin-') && request.url !== '/api/admin-auth';
    if (isAdminApi && error instanceof HttpErrorResponse && error.status === 401) {
      sessionStorage.removeItem('navrik_admin_token');
      if (!router.url.startsWith('/admin/login')) {
        void router.navigate(['/admin/login'], { queryParams: { reason: 'expired' } });
      }
    }
    return throwError(() => error);
  }));
};
