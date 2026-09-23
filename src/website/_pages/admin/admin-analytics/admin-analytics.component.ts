import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { AdminService, ControlCentreResponse, ControlMetricData, EnquiriesSnapshot } from '../../../_services/admin.service';
import { ControlMetricComponent } from '../../../_components/admin-control/control-metric.component';
import { ControlStateComponent } from '../../../_components/admin-control/control-state.component';
import { ControlHealthComponent } from '../../../_components/admin-control/control-health.component';

interface EnquiryMetric extends ControlMetricData { icon: string; }

@Component({
  selector: 'website-admin-analytics',
  standalone: true,
  imports: [DatePipe, MatIconModule, ControlMetricComponent, ControlStateComponent, ControlHealthComponent],
  templateUrl: './admin-analytics.component.html',
  styleUrl: './admin-analytics.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminAnalyticsComponent {
  private readonly adminService = inject(AdminService);

  readonly model = signal<ControlCentreResponse | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly snapshot = computed<EnquiriesSnapshot | null>(() => {
    const enquiries = this.model()?.data.enquiries;
    return enquiries?.status === 'ready' ? enquiries : null;
  });
  readonly unavailableReason = computed(() => {
    const enquiries = this.model()?.data.enquiries;
    return enquiries?.status === 'not_measured'
      ? enquiries.explanation
      : 'The server has not produced an enquiry snapshot yet.';
  });
  readonly metrics = computed<EnquiryMetric[]>(() => {
    const snapshot = this.snapshot();
    if (!snapshot) return [];
    const conversion = snapshot.conversion.denominator > 0
      ? (snapshot.conversion.numerator / snapshot.conversion.denominator) * 100
      : null;
    return [
      { label: 'Total enquiries', icon: 'forum', value: snapshot.enquiryCount, context: snapshot.scope.enquiries },
      { label: 'New enquiries', icon: 'notifications', value: snapshot.newEnquiries, context: snapshot.scope.enquiries, tone: 'warning' },
      { label: 'Quoted enquiries', icon: 'summarize', value: snapshot.quotedEnquiries, context: snapshot.scope.enquiries, tone: 'accent' },
      { label: 'Enquiry conversion', icon: 'bar_chart', value: conversion, format: 'percent', context: 'Converted enquiries divided by recorded enquiries.', tone: 'success' },
    ];
  });

  constructor() { void this.load(); }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.model.set(await this.adminService.getControlCentre());
    } catch {
      this.error.set('Enquiry analytics could not be loaded. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }
}
