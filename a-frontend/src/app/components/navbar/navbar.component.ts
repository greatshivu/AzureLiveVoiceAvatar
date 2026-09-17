import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <header class="navbar">
      <div class="nav-container">
        <div class="brand">
          <div class="logo-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 256 256" fill="currentColor">
              <path d="M224,128a96,96,0,1,1-96-96A96.11,96.11,0,0,1,224,128Zm-88-64a8,8,0,0,0-8,8v48H80a8,8,0,0,0,0,16h48v48a8,8,0,0,0,16,0V136h48a8,8,0,0,0,0-16H144V72A8,8,0,0,0,136,64Z" opacity="0.2"/>
              <path d="M224.26,119.51l-43.15-24.66a8,8,0,0,1-3.95-6.91V38.19a8,8,0,0,0-11.95-6.95L128,52.48,90.79,31.24a8,8,0,0,0-11.95,6.95V87.94a8,8,0,0,1-3.95,6.91L31.74,119.51a8,8,0,0,0,0,13.9l43.15,24.66a8,8,0,0,1,3.95,6.91v49.75a8,8,0,0,0,11.95,6.95L128,198.44l37.21,21.24a8,8,0,0,0,11.95-6.95V163a8,8,0,0,1,3.95-6.91l43.15-24.66A8,8,0,0,0,224.26,119.51Z"/>
            </svg>
          </div>
          <div>
            <h1 class="brand-title">Enterprise Portal</h1>
            <p class="brand-subtitle">Angular Frontend + Web Component Avatar</p>
          </div>
        </div>

        <nav class="nav-links">
          <a routerLink="/orders" routerLinkActive="active" class="nav-link">
            Orders Search
          </a>
          <a routerLink="/items" routerLinkActive="active" class="nav-link">
            Items Search
          </a>
        </nav>

        <div class="nav-status">
          <span class="api-status-dot"></span>
          <span class="api-status-text">Backend API (8000)</span>
        </div>
      </div>
    </header>
  `,
  styles: [`
    .navbar {
      background: #ffffff;
      border-bottom: 1px solid #e2e8f0;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
      position: sticky;
      top: 0;
      z-index: 40;
    }
    .nav-container {
      max-width: 1280px;
      margin: 0 auto;
      padding: 0 24px;
      height: 64px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .logo-icon {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      background: #2563eb;
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .brand-title {
      font-size: 16px;
      font-weight: 700;
      color: #0f172a;
      line-height: 1.2;
    }
    .brand-subtitle {
      font-size: 11px;
      color: #64748b;
      line-height: 1.2;
    }
    .nav-links {
      display: flex;
      gap: 8px;
      height: 100%;
      align-items: center;
    }
    .nav-link {
      padding: 8px 16px;
      font-size: 13px;
      font-weight: 600;
      color: #64748b;
      text-decoration: none;
      border-radius: 6px;
      transition: all 0.15s ease;
    }
    .nav-link:hover {
      color: #2563eb;
      background: #f1f5f9;
    }
    .nav-link.active {
      color: #2563eb;
      background: #eff6ff;
    }
    .nav-status {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 500;
      color: #475569;
    }
    .api-status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #10b981;
      box-shadow: 0 0 6px rgba(16, 185, 129, 0.5);
    }
  `],
})
export class NavbarComponent {}
