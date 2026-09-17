import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, catchError, of } from 'rxjs';
import { environment } from '../../environments/environment';

export interface OrderItem {
  id?: string;
  order_id?: string;
  order_number?: string;
  customer_name: string;
  status: string;
  priority: string;
  amount?: number;
  total_amount?: number;
  order_date?: string;
  is_paid?: boolean;
}

export interface ProductItem {
  id?: string;
  sku?: string;
  item_code?: string;
  name?: string;
  item_name?: string;
  category: string;
  stock: number;
  in_stock: boolean;
  price?: number;
  unit_price?: number;
  description?: string;
}

export interface SearchResponse<T> {
  results: T[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private readonly baseUrl = environment.apiUrl || `${environment.backendUrl}/api`;

  constructor(private http: HttpClient) {}

  getOrders(params: Record<string, any> = {}): Observable<SearchResponse<OrderItem>> {
    let httpParams = new HttpParams();
    Object.keys(params).forEach((key) => {
      if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
        httpParams = httpParams.set(key, params[key]);
      }
    });

    return this.http.get<SearchResponse<OrderItem>>(`${this.baseUrl}/orders`, { params: httpParams }).pipe(
      catchError((err) => {
        console.warn('Failed to fetch orders from API:', err);
        return of({ results: [], total: 0, page: 1, limit: 10, total_pages: 0 });
      })
    );
  }

  getItems(params: Record<string, any> = {}): Observable<SearchResponse<ProductItem>> {
    let httpParams = new HttpParams();
    Object.keys(params).forEach((key) => {
      if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
        httpParams = httpParams.set(key, params[key]);
      }
    });

    return this.http.get<SearchResponse<ProductItem>>(`${this.baseUrl}/items`, { params: httpParams }).pipe(
      catchError((err) => {
        console.warn('Failed to fetch items from API:', err);
        return of({ results: [], total: 0, page: 1, limit: 10, total_pages: 0 });
      })
    );
  }

  getPagesConfig(): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/pages`).pipe(
      catchError((err) => {
        console.warn('Failed to fetch pages config from API:', err);
        return of([]);
      })
    );
  }

  getConfig(): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/config`).pipe(
      catchError((err) => {
        console.warn('Failed to fetch config from API:', err);
        return of({});
      })
    );
  }
}
