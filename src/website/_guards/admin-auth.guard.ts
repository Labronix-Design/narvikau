import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

export const adminAuthGuard: CanActivateFn = () => {
  const router = inject(Router);
  const token = sessionStorage.getItem('navrik_admin_token');
  if (!token) {
    router.navigate(['/admin/login']);
    return false;
  }
  return true;
};
