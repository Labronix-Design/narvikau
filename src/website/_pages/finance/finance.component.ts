import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { RouterModule } from '@angular/router';
import { ButtonComponent } from '../../_components/button/button.component';
import { FinancePageService } from '../../_services/finance-page.service';

@Component({
  selector: 'website-finance',
  templateUrl: './finance.component.html',
  styleUrls: ['./finance.component.scss'],
  standalone: true,
  imports: [CommonModule, MatIconModule, RouterModule, ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FinancePage implements OnInit {
  financePageService = inject(FinancePageService);
  content = this.financePageService.content;

  ngOnInit(): void {
    this.financePageService.load();
  }
}
