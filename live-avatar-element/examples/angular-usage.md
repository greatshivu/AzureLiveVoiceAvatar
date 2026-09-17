# Using `<live-avatar-popup>` in Angular Applications

The `live-avatar-element` package is a standard Web Component (Custom Elements v1) with Shadow DOM encapsulation. It works seamlessly in **Angular 14, 15, 16, 17, 18, and 19+**.

---

## 1. Installation

You can install it directly from your private npm registry or copy the built files into your project:

```bash
# If published to npm
npm install live-avatar-element

# Or if using local package
npm install /path/to/live-avatar-element
```

---

## 2. Standalone Component Example (Angular 17 / 18+)

In modern Angular (standalone components), add `CUSTOM_ELEMENTS_SCHEMA` to your component's `@Component({ schemas: [...] })`:

### `app.component.ts`
```typescript
import { Component, ElementRef, ViewChild, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import 'live-avatar-element'; // Registers <live-avatar-popup> custom element
import type { LiveAvatarElement } from 'live-avatar-element';

@Component({
  selector: 'app-root',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA], // <-- CRITICAL: Tells Angular to allow custom elements
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  @ViewChild('avatarRef') avatarRef!: ElementRef<LiveAvatarElement>;

  apiUrl = 'http://localhost:8000'; // Your backend FastAPI endpoint
  currentRoute = '/orders';
  ordersData: any[] = [];

  constructor(private router: Router) {}

  ngOnInit() {
    this.loadOrders();
  }

  loadOrders() {
    // Example order fetch
    this.ordersData = [
      { order_id: 'ORD-9001', customer_name: 'Acme Corp', status: 'Delivered', priority: 'High', total_amount: 12500 },
      { order_id: 'ORD-9002', customer_name: 'Globex Ltd', status: 'Pending', priority: 'Medium', total_amount: 3400 }
    ];

    // Feed current rows to avatar so Lisa can read them aloud on voice request!
    setTimeout(() => {
      this.avatarRef?.nativeElement?.publishResults('orders', this.ordersData);
    }, 100);
  }

  // Handle voice navigation (e.g. "go to items search")
  onAvatarNavigate(event: CustomEvent<{ route: string; pageKey: string; message: string }>) {
    console.log('Voice navigation requested:', event.detail);
    this.router.navigateByUrl(event.detail.route);
    this.currentRoute = event.detail.route;
  }

  // Handle voice filtering (e.g. "show high priority orders", "filter by delivered")
  onAvatarFilter(event: CustomEvent<{ pageKey: string; filters: any; page?: any; reset?: boolean; message: string }>) {
    console.log('Voice filter requested:', event.detail);
    const { filters, reset } = event.detail;

    if (reset) {
      this.loadOrders(); // Reset to all
    } else {
      // Filter your table / grid
      if (filters.priority) {
        this.ordersData = this.ordersData.filter(o => o.priority.toLowerCase() === filters.priority.toLowerCase());
      }
      if (filters.status) {
        this.ordersData = this.ordersData.filter(o => o.status.toLowerCase() === filters.status.toLowerCase());
      }
      // Update the avatar's rows with the new filtered results
      this.avatarRef.nativeElement.publishResults('orders', this.ordersData);
    }
  }

  // Optional: Listen for avatar status changes
  onAvatarStatus(event: CustomEvent<{ status: string; isLive: boolean }>) {
    console.log('Avatar status:', event.detail);
  }
}
```

### `app.component.html`
```html
<main>
  <!-- Your Angular Application UI / Router Outlet -->
  <router-outlet></router-outlet>
</main>

<!-- Lisa Live Avatar Web Component -->
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
```

---

## 3. NgModule-based Applications (Angular 12–16)

If your project uses `AppModule`:

### `app.module.ts`
```typescript
import { NgModule, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { AppComponent } from './app.component';
import 'live-avatar-element'; // Import to register the custom element

@NgModule({
  declarations: [AppComponent],
  imports: [BrowserModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA], // <-- Allows <live-avatar-popup>
  bootstrap: [AppComponent]
})
export class AppModule {}
```

---

## 4. Angular Router Synchronization

To automatically sync Angular route changes with the avatar component:

```typescript
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';

constructor(private router: Router) {
  this.router.events.pipe(
    filter(event => event instanceof NavigationEnd)
  ).subscribe((event: any) => {
    this.avatarRef?.nativeElement?.setCurrentRoute(event.urlAfterRedirects);
  });
}
```

---

## 5. Summary of Events and Methods

### CustomEvents Emitted by `<live-avatar-popup>`:
- `(avatar-navigate)`: Dispatched when user commands page change.
- `(avatar-filter)`: Dispatched when user applies filter criteria or search.
- `(avatar-read)`: Dispatched when Lisa reads a row.
- `(avatar-status)`: Dispatched when connection status changes (`idle`, `connecting`, `negotiating`, `live`, `error`).
- `(avatar-message)`: Dispatched on transcript speech bubble addition.

### Methods callable on `avatarRef.nativeElement`:
- `publishResults(pageKey: string, rows: any[])`: Supplies rows to avatar.
- `setCurrentRoute(route: string)`: Updates current active route path.
- `setCurrentPage(pageKey: string)`: Directly sets page key (e.g. `'orders'`).
- `sendCommand(text: string)`: Triggers command programmatically.
- `open()` / `close()` / `toggle()`: Controls popup visibility.
- `start()` / `stop()` / `toggleAvatar(on: boolean)`: Controls avatar power & streaming.
