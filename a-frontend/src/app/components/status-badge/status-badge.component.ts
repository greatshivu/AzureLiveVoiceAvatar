import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-status-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="badge" [ngClass]="badgeClass">
      {{ label }}
    </span>
  `,
  styles: [`
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 3px 10px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.02em;
      line-height: 1.2;
    }
    .badge-delivered { background-color: #dcfce7; color: #15803d; border: 1px solid #bbf7d0; }
    .badge-pending { background-color: #fef9c3; color: #854d0e; border: 1px solid #fef08a; }
    .badge-shipped { background-color: #dbeafe; color: #1d4ed8; border: 1px solid #bfdbfe; }
    .badge-cancelled { background-color: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }
    .badge-in-stock { background-color: #dcfce7; color: #15803d; border: 1px solid #bbf7d0; }
    .badge-out-of-stock { background-color: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }
    .badge-high { background-color: #fef2f2; color: #dc2626; font-weight: 700; border: 1px solid #fee2e2; }
    .badge-medium { background-color: #fffbeb; color: #d97706; font-weight: 600; border: 1px solid #fef3c7; }
    .badge-low { background-color: #f0fdf4; color: #16a34a; font-weight: 500; border: 1px solid #dcfce7; }
    .badge-paid { background-color: #ecfdf5; color: #059669; }
    .badge-unpaid { background-color: #f8fafc; color: #94a3b8; }
    .badge-default { background-color: #f1f5f9; color: #475569; }
  `],
})
export class StatusBadgeComponent {
  @Input() value: any = '';
  @Input() type: 'status' | 'priority' | 'stock' | 'boolean' = 'status';

  get label(): string {
    if (this.type === 'boolean') {
      return this.value ? 'Paid' : 'Unpaid';
    }
    if (this.type === 'stock') {
      return this.value ? 'In Stock' : 'Out of Stock';
    }
    return String(this.value || '');
  }

  get badgeClass(): string {
    const v = String(this.value || '').toLowerCase().trim();

    if (this.type === 'priority') {
      if (v === 'high') return 'badge-high';
      if (v === 'medium') return 'badge-medium';
      if (v === 'low') return 'badge-low';
    }

    if (this.type === 'stock') {
      return this.value ? 'badge-in-stock' : 'badge-out-of-stock';
    }

    if (this.type === 'boolean') {
      return this.value ? 'badge-paid' : 'badge-unpaid';
    }

    if (v === 'delivered') return 'badge-delivered';
    if (v === 'pending') return 'badge-pending';
    if (v === 'shipped') return 'badge-shipped';
    if (v === 'cancelled') return 'badge-cancelled';
    if (v === 'in stock') return 'badge-in-stock';
    if (v === 'out of stock') return 'badge-out-of-stock';

    return 'badge-default';
  }
}
