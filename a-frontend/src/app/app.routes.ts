import { Routes } from '@angular/router';
import { SearchPageComponent } from './pages/search-page/search-page.component';

export const routes: Routes = [
  { path: '', redirectTo: 'orders', pathMatch: 'full' },
  { path: 'orders', component: SearchPageComponent, data: { pageKey: 'orders' } },
  { path: 'items', component: SearchPageComponent, data: { pageKey: 'items' } },
  { path: '**', redirectTo: 'orders' },
];
