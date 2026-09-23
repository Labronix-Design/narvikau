import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { AdminService } from '../../../_services/admin.service';
import { adminLoginErrorMessage } from './admin-login-error';

@Component({
  selector: 'website-admin-login',
  templateUrl: './admin-login.component.html',
  styleUrls: ['./admin-login.component.scss'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatIconModule],
})
export class AdminLoginComponent {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private adminService = inject(AdminService);

  form = this.fb.nonNullable.group({
    password: ['', Validators.required],
  });

  error = signal('');
  loading = signal(false);
  showPassword = signal(false);

  async onSubmit(): Promise<void> {
    if (this.form.invalid || this.loading()) return;
    this.error.set('');
    this.loading.set(true);
    try {
      const token = await this.adminService.login(this.form.getRawValue().password);
      sessionStorage.setItem('navrik_admin_token', token);
      this.router.navigate(['/admin/dashboard']);
    } catch (error: unknown) {
      this.error.set(adminLoginErrorMessage(error instanceof HttpErrorResponse ? error.status : undefined));
    } finally {
      this.loading.set(false);
    }
  }
}
