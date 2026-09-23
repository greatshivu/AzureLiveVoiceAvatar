import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { ApiService, OrderItem, ProductItem } from '../../services/api.service';
import {
  AvatarBridgeService,
  AvatarFilterCommand,
  AvatarClickCommand,
  AvatarCreateRequestCommand,
} from '../../services/avatar-bridge.service';
import { StatusBadgeComponent } from '../../components/status-badge/status-badge.component';

@Component({
  selector: 'app-search-page',
  standalone: true,
  imports: [CommonModule, FormsModule, StatusBadgeComponent],
  template: `
    <div class="page-container">
      <!-- Page Header -->
      <div class="page-header">
        <div>
          <h2 class="page-title">{{ isOrders ? 'Orders Search' : 'Items Search' }}</h2>
          <p class="page-subtitle">
            Search, filter, and manage {{ isOrders ? 'customer orders' : 'inventory products' }}. Voice controlled via Lisa Avatar.
          </p>
        </div>
        <div class="header-stats">
          <span class="stat-badge">
            <strong>{{ totalRecords }}</strong> {{ isOrders ? 'Orders' : 'Items' }} Found
          </span>
          <span *ngIf="activeFilterNotice" class="filter-notice">
            ⚡ {{ activeFilterNotice }}
          </span>
          <span *ngIf="lastActionNotice" class="action-notice">
            🖱️ {{ lastActionNotice }}
          </span>
          <span *ngIf="lastCreateNotice" class="create-notice">
            📝 {{ lastCreateNotice }}
          </span>
        </div>
      </div>

      <!-- CVS Create Request Service Card -->
      <div class="create-request-card">
        <div class="create-request-header">
          <div class="create-title-box">
            <span class="create-icon">⚡</span>
            <div>
              <h3 class="create-title">CVS Create Request Service</h3>
              <p class="create-subtitle">
                Trigger via voice: <em>"Create request [details]"</em> or use exposed function <code>window.sendCvsCreateRequest(text)</code>.
              </p>
            </div>
          </div>
          <span class="api-badge" title="CVS Local API">Exposed Function Active</span>
        </div>
        <div class="create-input-group">
          <input
            type="text"
            class="form-input create-input"
            placeholder="e.g. Expedite shipment for order ORD-100200 or restock SKU-1001..."
            [(ngModel)]="manualRequestText"
            (keydown.enter)="submitManualCreateRequest()"
          />
          <button
            type="button"
            class="btn-create-submit"
            (click)="submitManualCreateRequest()"
            [disabled]="!manualRequestText.trim()"
            title="Send to CVS Create Request API"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" fill="currentColor">
              <path d="M227.32,28.68a16,16,0,0,0-15.66-4.08l-184,56A16,16,0,0,0,24,96a15.82,15.82,0,0,0,9.25,14.5l75.6,37.8,37.8,75.6A15.84,15.84,0,0,0,160,232h.68a16,16,0,0,0,14.64-11.66l56-184A16,16,0,0,0,227.32,28.68Z"/>
            </svg>
            <span>Submit to API</span>
          </button>
        </div>
        <div *ngIf="recentRequests.length > 0" class="recent-requests">
          <span class="recent-label">Recent CVS Requests:</span>
          <div class="recent-tags">
            <span *ngFor="let req of recentRequests" class="request-tag" [title]="req.time">
              <strong>#{{ req.id }}</strong> {{ req.text }}
            </span>
          </div>
        </div>
      </div>

      <!-- Filter Controls Card -->
      <div class="filters-card">
        <div class="filters-grid">
          <!-- Search Input with Action Button -->
          <div class="filter-group search-group">
            <label class="filter-label">Search Keyword</label>
            <div class="search-input-group">
              <div class="input-with-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 256 256" fill="#94a3b8" class="search-icon">
                  <path d="M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z"/>
                </svg>
                <input
                  type="text"
                  class="form-input"
                  [placeholder]="isOrders ? 'Order #, customer...' : 'Item code, name...'"
                  [(ngModel)]="searchKeyword"
                  (keydown.enter)="onSearch()"
                />
                <button *ngIf="searchKeyword" type="button" class="btn-clear" (click)="clearKeyword()" title="Clear keyword">&times;</button>
              </div>
              <button type="button" class="btn-search" (click)="onSearch()" title="Search records">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" fill="currentColor">
                  <path d="M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z"/>
                </svg>
                <span>Search</span>
              </button>
            </div>
          </div>

          <!-- Orders Filters: Status, Priority Checkboxes & Paid Order Radio -->
          <ng-container *ngIf="isOrders">
            <div class="filter-group">
              <label class="filter-label">Order Status</label>
              <select class="form-select" [(ngModel)]="statusFilter" (change)="onFilterChange()">
                <option value="">All Statuses</option>
                <option value="Delivered">Delivered</option>
                <option value="Pending">Pending</option>
                <option value="Shipped">Shipped</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>

            <!-- Priority Checkboxes -->
            <div class="filter-group">
              <label class="filter-label">Priority (Checkboxes)</label>
              <div class="checkbox-pill-group">
                <label class="checkbox-pill pill-high" [class.checked]="priorityFilters['High']">
                  <input
                    type="checkbox"
                    [(ngModel)]="priorityFilters['High']"
                    (change)="onFilterChange()"
                  />
                  <span>High</span>
                </label>
                <label class="checkbox-pill pill-medium" [class.checked]="priorityFilters['Medium']">
                  <input
                    type="checkbox"
                    [(ngModel)]="priorityFilters['Medium']"
                    (change)="onFilterChange()"
                  />
                  <span>Medium</span>
                </label>
                <label class="checkbox-pill pill-low" [class.checked]="priorityFilters['Low']">
                  <input
                    type="checkbox"
                    [(ngModel)]="priorityFilters['Low']"
                    (change)="onFilterChange()"
                  />
                  <span>Low</span>
                </label>
              </div>
            </div>

            <!-- Paid Order Radio Buttons -->
            <div class="filter-group">
              <label class="filter-label">Paid Orders (Radio)</label>
              <div class="radio-pill-group">
                <label class="radio-pill" [class.checked]="paidStatus === 'all'">
                  <input
                    type="radio"
                    name="paidStatus"
                    value="all"
                    [(ngModel)]="paidStatus"
                    (change)="onFilterChange()"
                  />
                  <span>All</span>
                </label>
                <label class="radio-pill" [class.checked]="paidStatus === 'paid'">
                  <input
                    type="radio"
                    name="paidStatus"
                    value="paid"
                    [(ngModel)]="paidStatus"
                    (change)="onFilterChange()"
                  />
                  <span>Paid Only</span>
                </label>
                <label class="radio-pill" [class.checked]="paidStatus === 'unpaid'">
                  <input
                    type="radio"
                    name="paidStatus"
                    value="unpaid"
                    [(ngModel)]="paidStatus"
                    (change)="onFilterChange()"
                  />
                  <span>Unpaid</span>
                </label>
              </div>
            </div>
          </ng-container>

          <!-- Items Filters: Category & In Stock -->
          <ng-container *ngIf="!isOrders">
            <div class="filter-group">
              <label class="filter-label">Category</label>
              <select class="form-select" [(ngModel)]="categoryFilter" (change)="onFilterChange()">
                <option value="">All Categories</option>
                <option value="Electronics">Electronics</option>
                <option value="Apparel">Apparel</option>
                <option value="Home & Garden">Home & Garden</option>
                <option value="Sports">Sports</option>
                <option value="Books">Books</option>
              </select>
            </div>

            <div class="filter-group flex-center">
              <label class="checkbox-label">
                <input
                  type="checkbox"
                  class="form-checkbox"
                  [(ngModel)]="inStockOnly"
                  (change)="onFilterChange()"
                />
                <span>In Stock Only</span>
              </label>
            </div>
          </ng-container>

          <!-- Actions -->
          <div class="filter-group flex-end">
            <button type="button" class="btn-reset" (click)="resetFilters()">
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      <!-- Results Table Card -->
      <div class="table-card">
        <div *ngIf="loading" class="loading-overlay">
          <div class="spinner"></div>
          <span>Loading records...</span>
        </div>

        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr *ngIf="isOrders">
                <th>Order ID</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Payment</th>
                <th class="text-right">Total Amount</th>
                <th class="text-center">Actions</th>
              </tr>
              <tr *ngIf="!isOrders">
                <th>Item Code</th>
                <th>Item Name</th>
                <th>Category</th>
                <th>Stock Status</th>
                <th>Available Units</th>
                <th class="text-right">Unit Price</th>
                <th class="text-center">Actions</th>
              </tr>
            </thead>

            <tbody>
              <!-- Orders Rows -->
              <ng-container *ngIf="isOrders">
                <tr
                  *ngFor="let row of orders; let idx = index"
                  class="table-row"
                  [attr.data-row-index]="idx"
                  [attr.data-row-id]="row.order_number || row.order_id"
                  [class.row-highlighted]="isRowHighlighted(idx, row.order_number || row.order_id)"
                >
                  <td>
                    <a
                      href="javascript:void(0)"
                      class="row-link"
                      data-action="link"
                      [attr.data-field]="'order_number'"
                      (click)="onRowLinkClick(row, idx, 'order_number')"
                      title="Open Order Details"
                    >
                      <strong class="text-primary">{{ row.order_number || row.order_id }}</strong>
                    </a>
                  </td>
                  <td>{{ row.customer_name }}</td>
                  <td><app-status-badge [value]="row.status" type="status"></app-status-badge></td>
                  <td><app-status-badge [value]="row.priority" type="priority"></app-status-badge></td>
                  <td><app-status-badge [value]="row.is_paid" type="boolean"></app-status-badge></td>
                  <td class="text-right tabular-nums"><strong>\${{ (row.amount ?? row.total_amount) | number:'1.2-2' }}</strong></td>
                  <td class="text-center action-cell">
                    <button
                      type="button"
                      class="btn-action btn-edit"
                      data-action="edit"
                      title="Edit order {{ row.order_number || row.order_id }}"
                      (click)="onEditRow(row, idx)"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 256 256" fill="currentColor">
                        <path d="M227.31,73.37,182.63,28.68a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.31,96a16,16,0,0,0,0-22.63ZM92.69,208H48V163.31l88-88L180.69,120ZM192,108.68,147.31,64l24-24L216,84.68Z"/>
                      </svg>
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      class="btn-action btn-delete"
                      data-action="delete"
                      title="Delete order {{ row.order_number || row.order_id }}"
                      (click)="onDeleteRow(row, idx)"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 256 256" fill="currentColor">
                        <path d="M216,48H176V40a24,24,0,0,0-24-24H104A24,24,0,0,0,80,40v8H40a8,8,0,0,0,0,16h8V208a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64h8a8,8,0,0,0,0-16ZM96,40a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8v8H96Zm96,168H64V64H192ZM112,104v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Zm48,0v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Z"/>
                      </svg>
                      <span>Delete</span>
                    </button>
                  </td>
                </tr>
              </ng-container>

              <!-- Items Rows -->
              <ng-container *ngIf="!isOrders">
                <tr
                  *ngFor="let row of items; let idx = index"
                  class="table-row"
                  [attr.data-row-index]="idx"
                  [attr.data-row-id]="row.sku || row.item_code"
                  [class.row-highlighted]="isRowHighlighted(idx, row.sku || row.item_code)"
                >
                  <td>
                    <a
                      href="javascript:void(0)"
                      class="row-link"
                      data-action="link"
                      [attr.data-field]="'sku'"
                      (click)="onRowLinkClick(row, idx, 'sku')"
                      title="Open Item Details"
                    >
                      <strong class="text-primary">{{ row.sku || row.item_code }}</strong>
                    </a>
                  </td>
                  <td>{{ row.name || row.item_name }}</td>
                  <td><span class="category-tag">{{ row.category }}</span></td>
                  <td><app-status-badge [value]="row.in_stock" type="stock"></app-status-badge></td>
                  <td class="tabular-nums">{{ row.stock }} units</td>
                  <td class="text-right tabular-nums"><strong>\${{ (row.price ?? row.unit_price) | number:'1.2-2' }}</strong></td>
                  <td class="text-center action-cell">
                    <button
                      type="button"
                      class="btn-action btn-edit"
                      data-action="edit"
                      title="Edit item {{ row.sku || row.item_code }}"
                      (click)="onEditRow(row, idx)"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 256 256" fill="currentColor">
                        <path d="M227.31,73.37,182.63,28.68a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.31,96a16,16,0,0,0,0-22.63ZM92.69,208H48V163.31l88-88L180.69,120ZM192,108.68,147.31,64l24-24L216,84.68Z"/>
                      </svg>
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      class="btn-action btn-delete"
                      data-action="delete"
                      title="Delete item {{ row.sku || row.item_code }}"
                      (click)="onDeleteRow(row, idx)"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 256 256" fill="currentColor">
                        <path d="M216,48H176V40a24,24,0,0,0-24-24H104A24,24,0,0,0,80,40v8H40a8,8,0,0,0,0,16h8V208a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64h8a8,8,0,0,0,0-16ZM96,40a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8v8H96Zm96,168H64V64H192ZM112,104v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Zm48,0v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Z"/>
                      </svg>
                      <span>Delete</span>
                    </button>
                  </td>
                </tr>
              </ng-container>

              <!-- Empty state -->
              <tr *ngIf="!loading && ((isOrders && orders.length === 0) || (!isOrders && items.length === 0))">
                <td [attr.colspan]="7" class="empty-state">
                  <div class="empty-content">
                    <p class="empty-title">No matching records found</p>
                    <p class="empty-subtitle">Try adjusting your filters or use voice commands like "reset filters".</p>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination Bar -->
        <div class="pagination-bar">
          <div class="pagination-info">
            Showing {{ ((currentPage - 1) * pageSize) + 1 }} to {{ getEndIndex() }} of {{ totalRecords }} records
          </div>
          <div class="pagination-actions">
            <button
              class="page-btn"
              [disabled]="currentPage <= 1 || loading"
              (click)="goToPage(currentPage - 1)">
              Previous
            </button>
            <span class="page-current">Page {{ currentPage }} of {{ totalPages || 1 }}</span>
            <button
              class="page-btn"
              [disabled]="currentPage >= totalPages || loading"
              (click)="goToPage(currentPage + 1)">
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .page-container {
      max-width: 1280px;
      margin: 0 auto;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .page-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 16px;
    }
    .page-title {
      font-size: 24px;
      font-weight: 700;
      color: #0f172a;
      letter-spacing: -0.02em;
    }
    .page-subtitle {
      font-size: 13px;
      color: #64748b;
      margin-top: 4px;
    }
    .header-stats {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .stat-badge {
      padding: 6px 14px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 20px;
      font-size: 13px;
      color: #334155;
      box-shadow: 0 1px 2px rgba(0,0,0,0.04);
    }
    .filter-notice {
      padding: 6px 12px;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      color: #1d4ed8;
      animation: pulse-notice 2s infinite;
    }
    .action-notice {
      padding: 6px 12px;
      background: #fdf2f8;
      border: 1px solid #fbcfe8;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      color: #be185d;
      animation: pulse-notice 2s infinite;
    }
    .create-notice {
      padding: 6px 12px;
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      color: #15803d;
      animation: pulse-notice 2s infinite;
    }
    @keyframes pulse-notice {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }
    .create-request-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-left: 4px solid #7c3aed;
      border-radius: 12px;
      padding: 16px 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
    }
    .create-request-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px;
    }
    .create-title-box {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .create-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      background: #f5f3ff;
      border-radius: 8px;
      font-size: 16px;
    }
    .create-title {
      font-size: 14px;
      font-weight: 700;
      color: #1e1b4b;
      margin: 0;
    }
    .create-subtitle {
      font-size: 12px;
      color: #64748b;
      margin: 2px 0 0 0;
    }
    .create-subtitle code {
      background: #f1f5f9;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 11px;
      color: #0f172a;
    }
    .api-badge {
      font-size: 11px;
      font-weight: 600;
      padding: 4px 8px;
      background: #ede9fe;
      color: #6d28d9;
      border-radius: 6px;
    }
    .create-input-group {
      display: flex;
      gap: 8px;
    }
    .create-input {
      flex: 1;
    }
    .btn-create-submit {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 0 16px;
      height: 38px;
      background: #7c3aed;
      color: #ffffff;
      border: none;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.15s ease;
    }
    .btn-create-submit:hover:not(:disabled) {
      background: #6d28d9;
    }
    .btn-create-submit:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .recent-requests {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      font-size: 12px;
    }
    .recent-label {
      font-weight: 600;
      color: #64748b;
    }
    .recent-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .request-tag {
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      padding: 2px 10px;
      font-size: 11px;
      color: #334155;
    }
    .request-tag strong {
      color: #7c3aed;
      margin-right: 4px;
    }
    .filters-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 18px 20px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }
    .filters-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 16px;
      align-items: flex-end;
    }
    .span-2 {
      grid-column: span 2;
    }
    .filter-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .flex-center {
      justify-content: center;
      height: 38px;
    }
    .flex-end {
      align-items: flex-end;
    }
    .filter-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #64748b;
    }
    .input-with-icon {
      position: relative;
      display: flex;
      align-items: center;
    }
    .search-icon {
      position: absolute;
      left: 12px;
      pointer-events: none;
    }
    .form-input {
      width: 100%;
      height: 38px;
      padding: 0 12px 0 34px;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      font-size: 13px;
      color: #0f172a;
      outline: none;
      transition: border-color 0.15s ease;
    }
    .form-input:focus {
      border-color: #2563eb;
      box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.12);
    }
    .form-select {
      width: 100%;
      height: 38px;
      padding: 0 12px;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      font-size: 13px;
      color: #0f172a;
      background: #ffffff;
      outline: none;
      cursor: pointer;
    }
    .form-select:focus {
      border-color: #2563eb;
    }
    .search-group {
      grid-column: span 2;
    }
    .search-input-group {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .search-input-group .input-with-icon {
      flex: 1;
    }
    .btn-clear {
      position: absolute;
      right: 10px;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      font-size: 16px;
      line-height: 1;
      color: #94a3b8;
      cursor: pointer;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .btn-clear:hover {
      color: #0f172a;
      background: #f1f5f9;
    }
    .btn-search {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 38px;
      padding: 0 14px;
      background: #2563eb;
      color: #ffffff;
      border: none;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.15s ease;
    }
    .btn-search:hover {
      background: #1d4ed8;
    }
    .checkbox-pill-group, .radio-pill-group {
      display: flex;
      gap: 6px;
      height: 38px;
      align-items: center;
    }
    .checkbox-pill, .radio-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      height: 34px;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      background: #f8fafc;
      color: #475569;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      user-select: none;
      transition: all 0.15s ease;
    }
    .checkbox-pill input, .radio-pill input {
      accent-color: #2563eb;
      width: 14px;
      height: 14px;
      cursor: pointer;
      margin: 0;
    }
    .checkbox-pill:hover, .radio-pill:hover {
      background: #f1f5f9;
      color: #0f172a;
    }
    .checkbox-pill.checked, .radio-pill.checked {
      background: #eff6ff;
      border-color: #93c5fd;
      color: #1d4ed8;
    }
    .checkbox-pill.pill-high.checked {
      background: #fef2f2;
      border-color: #fca5a5;
      color: #b91c1c;
    }
    .checkbox-pill.pill-medium.checked {
      background: #fffbeb;
      border-color: #fcd34d;
      color: #b45309;
    }
    .checkbox-pill.pill-low.checked {
      background: #f0fdf4;
      border-color: #86efac;
      color: #15803d;
    }
    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      font-weight: 500;
      color: #334155;
      cursor: pointer;
      user-select: none;
    }
    .form-checkbox {
      width: 16px;
      height: 16px;
      accent-color: #2563eb;
      cursor: pointer;
    }
    .btn-reset {
      height: 38px;
      padding: 0 16px;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      color: #475569;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .btn-reset:hover {
      background: #f8fafc;
      color: #0f172a;
      border-color: #94a3b8;
    }
    .table-card {
      position: relative;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }
    .table-responsive {
      overflow-x: auto;
    }
    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .data-table th {
      background: #f8fafc;
      padding: 12px 16px;
      text-align: left;
      font-weight: 600;
      color: #475569;
      border-bottom: 1px solid #e2e8f0;
      white-space: nowrap;
    }
    .data-table td {
      padding: 12px 16px;
      border-bottom: 1px solid #f1f5f9;
      color: #1e293b;
    }
    .table-row:hover td {
      background: #f8fafc;
    }
    .text-primary {
      color: #2563eb;
    }
    .text-right {
      text-align: right;
    }
    .tabular-nums {
      font-variant-numeric: tabular-nums;
    }
    .category-tag {
      display: inline-block;
      padding: 2px 8px;
      background: #f1f5f9;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
      color: #475569;
    }
    .text-center {
      text-align: center;
    }
    .action-cell {
      white-space: nowrap;
      width: 140px;
    }
    .btn-action {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      margin: 0 3px;
      border: 1px solid transparent;
      transition: all 0.15s ease;
    }
    .btn-edit {
      background: #f0fdf4;
      border-color: #bbf7d0;
      color: #166534;
    }
    .btn-edit:hover {
      background: #dcfce7;
      border-color: #86efac;
    }
    .btn-delete {
      background: #fef2f2;
      border-color: #fecaca;
      color: #991b1b;
    }
    .btn-delete:hover {
      background: #fee2e2;
      border-color: #fca5a5;
    }
    .row-link {
      text-decoration: none;
      color: #2563eb;
      font-weight: 600;
      border-bottom: 1px dashed #93c5fd;
      transition: color 0.15s ease, border-color 0.15s ease;
    }
    .row-link:hover {
      color: #1d4ed8;
      border-bottom-style: solid;
    }
    .row-highlighted td {
      background: #eff6ff !important;
      outline: 1px solid #3b82f6;
      transition: background 0.3s ease;
    }
    .empty-state {
      padding: 48px 16px;
      text-align: center;
    }
    .empty-title {
      font-size: 15px;
      font-weight: 600;
      color: #334155;
    }
    .empty-subtitle {
      font-size: 13px;
      color: #94a3b8;
      margin-top: 4px;
    }
    .loading-overlay {
      position: absolute;
      inset: 0;
      background: rgba(255, 255, 255, 0.8);
      backdrop-filter: blur(2px);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      z-index: 10;
      font-size: 13px;
      color: #475569;
      font-weight: 500;
    }
    .spinner {
      width: 28px;
      height: 28px;
      border: 3px solid #e2e8f0;
      border-top-color: #2563eb;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .pagination-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 20px;
      background: #ffffff;
      border-top: 1px solid #e2e8f0;
      font-size: 13px;
      color: #64748b;
    }
    .pagination-actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .page-btn {
      padding: 6px 12px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      background: #ffffff;
      color: #334155;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .page-btn:hover:not(:disabled) {
      background: #f8fafc;
      border-color: #94a3b8;
    }
    .page-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .page-current {
      font-weight: 600;
      color: #1e293b;
    }
  `],
})
export class SearchPageComponent implements OnInit, OnDestroy {
  pageKey: 'orders' | 'items' = 'orders';
  orders: OrderItem[] = [];
  items: ProductItem[] = [];

  loading: boolean = false;
  totalRecords: number = 0;
  totalPages: number = 1;
  currentPage: number = 1;
  pageSize: number = 10;

  // Filter models
  searchKeyword: string = '';
  statusFilter: string = '';
  priorityFilters: Record<string, boolean> = { High: false, Medium: false, Low: false };
  paidStatus: 'all' | 'paid' | 'unpaid' = 'all';
  categoryFilter: string = '';
  inStockOnly: boolean = false;

  activeFilterNotice: string = '';
  lastActionNotice: string = '';
  lastCreateNotice: string = '';
  highlightedRowIndex: number = -1;
  highlightedRowId: string = '';
  private highlightTimer: any = null;

  manualRequestText: string = '';
  recentRequests: Array<{ id: string; text: string; time: string }> = [];

  private sub!: Subscription;
  private filterSub!: Subscription;
  private clickSub!: Subscription;
  private createSub!: Subscription;

  constructor(
    private route: ActivatedRoute,
    private api: ApiService,
    private avatarBridge: AvatarBridgeService
  ) {}

  get isOrders(): boolean {
    return this.pageKey === 'orders';
  }

  ngOnInit() {
    this.sub = this.route.data.subscribe((data) => {
      this.pageKey = data['pageKey'] || 'orders';
      this.avatarBridge.setActivePage(this.pageKey);
      this.resetFilters(false);
      this.fetchData();
    });

    // Listen for voice / agent commands from <live-avatar-popup>
    this.filterSub = this.avatarBridge.filterEvents$.subscribe((cmd: AvatarFilterCommand) => {
      if (!cmd.pageKey || cmd.pageKey === this.pageKey || cmd.reset) {
        this.applyAvatarFilterCommand(cmd);
      }
    });

    // Listen for avatar click commands (links, edit, delete, row targeting)
    this.clickSub = this.avatarBridge.clickEvents$.subscribe((cmd: AvatarClickCommand) => {
      this.handleAvatarClickCommand(cmd);
    });

    // Listen for avatar create_request commands
    this.createSub = this.avatarBridge.createRequestEvents$.subscribe((cmd: AvatarCreateRequestCommand) => {
      this.handleAvatarCreateRequestCommand(cmd);
    });
  }

  ngOnDestroy() {
    if (this.sub) this.sub.unsubscribe();
    if (this.filterSub) this.filterSub.unsubscribe();
    if (this.clickSub) this.clickSub.unsubscribe();
    if (this.createSub) this.createSub.unsubscribe();
    if (this.highlightTimer) clearTimeout(this.highlightTimer);
  }

  onSearch() {
    this.currentPage = 1;
    this.activeFilterNotice = '';
    this.fetchData();
  }

  clearKeyword() {
    this.searchKeyword = '';
    this.onSearch();
  }

  getSelectedPriorities(): string[] {
    return Object.keys(this.priorityFilters).filter((k) => this.priorityFilters[k]);
  }

  fetchData() {
    this.loading = true;

    if (this.isOrders) {
      const params: Record<string, any> = {
        page: this.currentPage,
        page_size: this.pageSize,
      };
      const kw = this.searchKeyword.trim();
      if (kw) {
        params['q'] = kw;
        params['search'] = kw;
        params['keyword'] = kw;
      }
      if (this.statusFilter) params['status'] = this.statusFilter;

      const selectedPrios = this.getSelectedPriorities();
      if (selectedPrios.length > 0) {
        params['priority'] = selectedPrios.join(',');
      }

      if (this.paidStatus === 'paid') {
        params['paid_status'] = 'paid';
        params['paid_only'] = true;
      } else if (this.paidStatus === 'unpaid') {
        params['paid_status'] = 'unpaid';
        params['paid_only'] = false;
      }

      // Publish active filters to avatar bridge
      const activeFilters: Record<string, any> = {};
      if (kw) activeFilters['q'] = kw;
      if (this.statusFilter) activeFilters['status'] = this.statusFilter;
      if (selectedPrios.length > 0) activeFilters['priority'] = selectedPrios.join(',');
      if (this.paidStatus === 'paid') {
        activeFilters['paid_status'] = 'paid';
        activeFilters['paid_only'] = true;
      } else if (this.paidStatus === 'unpaid') {
        activeFilters['paid_status'] = 'unpaid';
        activeFilters['paid_only'] = false;
      }
      this.avatarBridge.publishActiveFilters('orders', activeFilters);

      this.api.getOrders(params).subscribe({
        next: (res) => {
          this.orders = res.results || [];
          this.totalRecords = res.total || 0;
          this.totalPages = res.total_pages || Math.ceil(this.totalRecords / this.pageSize);
          this.loading = false;
          // Supply rows to avatar so Lisa can read them aloud!
          this.avatarBridge.publishResults('orders', this.orders);
        },
        error: () => {
          this.loading = false;
        },
      });
    } else {
      const params: Record<string, any> = {
        page: this.currentPage,
        page_size: this.pageSize,
      };
      const kw = this.searchKeyword.trim();
      if (kw) {
        params['q'] = kw;
        params['search'] = kw;
        params['keyword'] = kw;
      }
      if (this.categoryFilter) params['category'] = this.categoryFilter;
      if (this.inStockOnly) {
        params['in_stock'] = true;
        params['in_stock_only'] = true;
      }

      // Publish active filters to avatar bridge
      const activeFilters: Record<string, any> = {};
      if (kw) activeFilters['q'] = kw;
      if (this.categoryFilter) activeFilters['category'] = this.categoryFilter;
      if (this.inStockOnly) activeFilters['in_stock_only'] = true;
      this.avatarBridge.publishActiveFilters('items', activeFilters);

      this.api.getItems(params).subscribe({
        next: (res) => {
          this.items = res.results || [];
          this.totalRecords = res.total || 0;
          this.totalPages = res.total_pages || Math.ceil(this.totalRecords / this.pageSize);
          this.loading = false;
          // Supply rows to avatar
          this.avatarBridge.publishResults('items', this.items);
        },
        error: () => {
          this.loading = false;
        },
      });
    }
  }

  onFilterChange() {
    this.currentPage = 1;
    this.activeFilterNotice = '';
    this.fetchData();
  }

  resetFilters(fetch: boolean = true) {
    this.searchKeyword = '';
    this.statusFilter = '';
    this.priorityFilters = { High: false, Medium: false, Low: false };
    this.paidStatus = 'all';
    this.categoryFilter = '';
    this.inStockOnly = false;
    this.currentPage = 1;
    this.activeFilterNotice = '';
    if (fetch) {
      this.avatarBridge.publishActiveFilters(this.pageKey, {});
      this.fetchData();
    }
  }

  goToPage(page: number) {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
    this.fetchData();
  }

  getEndIndex(): number {
    return Math.min(this.currentPage * this.pageSize, this.totalRecords);
  }

  private applyAvatarFilterCommand(cmd: AvatarFilterCommand) {
    if (cmd.reset) {
      this.resetFilters(true);
      this.activeFilterNotice = 'Filters cleared by avatar';
      return;
    }

    const f = cmd.filters || {};
    let applied = false;

    // Support q, search, keyword, name, and order_number from avatar actions
    const kw = f['q'] ?? f['search'] ?? f['keyword'] ?? f['name'] ?? f['order_number'];
    if (kw !== undefined && kw !== null && String(kw).trim() !== '') {
      this.searchKeyword = String(kw).trim();
      applied = true;
    }

    if (f['status']) {
      this.statusFilter = f['status'];
      applied = true;
    }

    // Priority filter (checkboxes)
    if (f['priority']) {
      this.priorityFilters = { High: false, Medium: false, Low: false };
      const prioStr = String(f['priority']);
      prioStr.split(',').forEach((p) => {
        const cleanP = p.trim().toLowerCase();
        for (const key of Object.keys(this.priorityFilters)) {
          if (key.toLowerCase() === cleanP) {
            this.priorityFilters[key] = true;
          }
        }
      });
      applied = true;
    }

    // Paid status filter (radio)
    if (f['paid_status']) {
      this.paidStatus = f['paid_status'] as ('all' | 'paid' | 'unpaid');
      applied = true;
    } else if (f['paid_only'] !== undefined || f['is_paid'] !== undefined) {
      const isPaid = !!(f['paid_only'] ?? f['is_paid']);
      this.paidStatus = isPaid ? 'paid' : 'unpaid';
      applied = true;
    }

    if (f['category']) {
      this.categoryFilter = f['category'];
      applied = true;
    }

    if (f['in_stock'] !== undefined || f['in_stock_only'] !== undefined) {
      this.inStockOnly = !!(f['in_stock'] ?? f['in_stock_only']);
      applied = true;
    }

    if (cmd.page === 'next') {
      this.currentPage++;
      applied = true;
    } else if (cmd.page === 'prev') {
      this.currentPage = Math.max(1, this.currentPage - 1);
      applied = true;
    } else if (cmd.page === 'first') {
      this.currentPage = 1;
      applied = true;
    } else if (cmd.page === 'last') {
      this.currentPage = this.totalPages;
      applied = true;
    } else if (typeof cmd.page === 'number') {
      this.currentPage = cmd.page;
      applied = true;
    } else if (!cmd.sort && !cmd.sortBy) {
      this.currentPage = 1;
    }

    if (cmd.sort || cmd.sortBy) {
      applied = true;
    }

    if (applied) {
      this.activeFilterNotice = cmd.message || 'Filter applied by avatar';
      this.fetchData();
    }
  }

  private handleAvatarClickCommand(cmd: AvatarClickCommand) {
    const rows = this.isOrders ? this.orders : this.items;
    if (!rows || rows.length === 0) return;

    let targetIdx = -1;
    let targetRow: any = null;

    if (cmd.row_identifier) {
      const cleanId = String(cmd.row_identifier).toLowerCase().trim();
      targetIdx = rows.findIndex((r: any) => {
        const id1 = String(r.order_number || r.order_id || '').toLowerCase();
        const id2 = String(r.sku || r.item_code || '').toLowerCase();
        return id1 === cleanId || id2 === cleanId || id1.includes(cleanId) || id2.includes(cleanId);
      });
    }

    if (targetIdx === -1) {
      const rowNum = cmd.row_number ?? (cmd.row_index !== undefined ? cmd.row_index + 1 : undefined);
      if (rowNum === -1) {
        targetIdx = rows.length - 1;
      } else if (typeof rowNum === 'number' && rowNum >= 1 && rowNum <= rows.length) {
        targetIdx = rowNum - 1;
      }
    }

    if (targetIdx !== -1) {
      targetRow = rows[targetIdx];
      const rowIdentifier = targetRow.order_number || targetRow.order_id || targetRow.sku || targetRow.item_code;
      this.highlightRow(targetIdx, rowIdentifier);

      const elem = (cmd.element || cmd.action_type || 'edit').toLowerCase();
      if (elem === 'edit') {
        this.onEditRow(targetRow, targetIdx);
      } else if (elem === 'delete') {
        this.onDeleteRow(targetRow, targetIdx);
      } else if (elem === 'link' || elem === 'order_number' || elem === 'quote_number' || elem === 'sku') {
        this.onRowLinkClick(targetRow, targetIdx, elem);
      } else {
        this.lastActionNotice = `Clicked ${elem} on row ${targetIdx + 1} (${rowIdentifier})`;
      }
    } else {
      this.lastActionNotice = `Target row not found on current page (${cmd.row_identifier || cmd.row_number})`;
    }
  }

  private handleAvatarCreateRequestCommand(cmd: AvatarCreateRequestCommand) {
    const text = (cmd.request_text || cmd.text || '').trim();
    if (!text) return;
    const reqId = cmd.requestId || 'REQ-' + Math.floor(100000 + Math.random() * 900000);
    this.lastCreateNotice = `Created request: "${text}"`;
    this.recentRequests.unshift({
      id: reqId,
      text,
      time: new Date().toLocaleTimeString(),
    });
    if (this.recentRequests.length > 5) {
      this.recentRequests.pop();
    }
  }

  highlightRow(idx: number, id?: string) {
    this.highlightedRowIndex = idx;
    this.highlightedRowId = id || '';
    if (this.highlightTimer) clearTimeout(this.highlightTimer);
    this.highlightTimer = setTimeout(() => {
      this.highlightedRowIndex = -1;
      this.highlightedRowId = '';
    }, 2500);
  }

  isRowHighlighted(idx: number, id?: string): boolean {
    return this.highlightedRowIndex === idx || (!!this.highlightedRowId && this.highlightedRowId === id);
  }

  onEditRow(row: any, idx: number) {
    const id = row.order_number || row.order_id || row.sku || row.item_code || `Row ${idx + 1}`;
    this.highlightRow(idx, id);
    this.lastActionNotice = `Editing ${this.isOrders ? 'order' : 'item'} ${id} (Row ${idx + 1})`;
  }

  onDeleteRow(row: any, idx: number) {
    const id = row.order_number || row.order_id || row.sku || row.item_code || `Row ${idx + 1}`;
    this.highlightRow(idx, id);
    this.lastActionNotice = `Deleted ${this.isOrders ? 'order' : 'item'} ${id} (Row ${idx + 1})`;
  }

  onRowLinkClick(row: any, idx: number, field: string) {
    const id = row.order_number || row.order_id || row.sku || row.item_code || `Row ${idx + 1}`;
    this.highlightRow(idx, id);
    this.lastActionNotice = `Opened details for ${field}: ${id} (Row ${idx + 1})`;
  }

  submitManualCreateRequest() {
    const text = this.manualRequestText.trim();
    if (!text) return;

    // Route through window exposed CVS function if registered
    if (typeof (window as any).sendCvsCreateRequest === 'function') {
      (window as any).sendCvsCreateRequest(text);
    } else if (typeof (window as any).cvsCreateRequest === 'function') {
      (window as any).cvsCreateRequest(text);
    } else {
      this.avatarBridge.dispatchCreateRequest({
        type: 'create_request',
        request_text: text,
      });
    }

    this.manualRequestText = '';
  }
}
