import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  ViewChild,
  ElementRef,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { Subscription } from 'rxjs';
import 'live-avatar-element';
import type { LiveAvatarElement } from 'live-avatar-element';

import { NavbarComponent } from './components/navbar/navbar.component';
import { AvatarBridgeService } from './services/avatar-bridge.service';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterModule, NavbarComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <div class="app-layout">
      <app-navbar></app-navbar>

      <main class="main-content">
        <router-outlet></router-outlet>
      </main>

      <!-- STANDALONE LIVE AVATAR WEB COMPONENT -->
      <live-avatar-popup
        #avatarRef
        [attr.api-url]="apiUrl"
        [attr.current-route]="currentRoute"
        [attr.use-agent]="'true'"
        [attr.auto-turn]="'true'"
        (avatar-navigate)="onAvatarNavigate($event)"
        (avatar-filter)="onAvatarFilter($event)"
        (avatar-status)="onAvatarStatus($event)">
      </live-avatar-popup>
    </div>
  `,
  styles: [`
    .app-layout {
      min-height: 100vh;
      background-color: #f8f9fa;
      display: flex;
      flex-direction: column;
    }
    .main-content {
      flex: 1;
      padding-bottom: 80px;
    }
  `],
})
export class AppComponent implements OnInit, OnDestroy {
  @ViewChild('avatarRef') avatarRef!: ElementRef<LiveAvatarElement>;

  apiUrl = environment.backendUrl;
  currentRoute = '/orders';

  private routerSub!: Subscription;
  private resultsSub!: Subscription;
  private filtersSub!: Subscription;

  constructor(
    private router: Router,
    private avatarBridge: AvatarBridgeService
  ) {}

  ngOnInit() {
    // Keep active route synchronized with the avatar component
    this.routerSub = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event: any) => {
        this.currentRoute = event.urlAfterRedirects;
        if (this.avatarRef?.nativeElement) {
          this.avatarRef.nativeElement.setCurrentRoute(this.currentRoute);
        }
      });

    // When the active search table updates results, feed them to Lisa for reading aloud
    this.resultsSub = this.avatarBridge.resultsEvents$.subscribe((evt) => {
      if (this.avatarRef?.nativeElement) {
        this.avatarRef.nativeElement.publishResults(evt.pageKey, evt.rows);
      }
    });

    // When active search filters change, keep the avatar updated so agent mode is aware
    this.filtersSub = this.avatarBridge.activeFilters$.subscribe((evt) => {
      if (this.avatarRef?.nativeElement && typeof (this.avatarRef.nativeElement as any).setActiveFilters === 'function') {
        (this.avatarRef.nativeElement as any).setActiveFilters(evt.filters);
      }
    });
  }

  ngOnDestroy() {
    if (this.routerSub) this.routerSub.unsubscribe();
    if (this.resultsSub) this.resultsSub.unsubscribe();
    if (this.filtersSub) this.filtersSub.unsubscribe();
  }

  // Handle voice navigation (e.g. "go to items search" / "open orders")
  onAvatarNavigate(event: any) {
    const detail = event?.detail || {};
    console.log('[Angular] Voice navigation received from avatar:', detail);
    if (detail.route) {
      this.router.navigateByUrl(detail.route);
      this.currentRoute = detail.route;
    }
  }

  // Handle voice filter commands (e.g. "show delivered orders", "filter by medium priority")
  onAvatarFilter(event: any) {
    const detail = event?.detail || {};
    console.log('[Angular] Voice filter received from avatar:', detail);
    this.avatarBridge.dispatchFilter(detail);
  }

  // Handle avatar status changes
  onAvatarStatus(event: any) {
    console.log('[Angular] Avatar status change:', event?.detail);
  }
}
