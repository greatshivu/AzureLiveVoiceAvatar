import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';

export interface AvatarFilterCommand {
  pageKey: string;
  filters: Record<string, any>;
  page?: number | string;
  reset?: boolean;
  message?: string;
}

export interface TableResultsEvent {
  pageKey: string;
  rows: any[];
}

@Injectable({
  providedIn: 'root',
})
export class AvatarBridgeService {
  private filterSubject = new Subject<AvatarFilterCommand>();
  private resultsSubject = new Subject<TableResultsEvent>();
  private activePageSubject = new Subject<string>();

  private activeFiltersSubject = new Subject<{ pageKey: string; filters: Record<string, any> }>();

  public filterEvents$: Observable<AvatarFilterCommand> = this.filterSubject.asObservable();
  public resultsEvents$: Observable<TableResultsEvent> = this.resultsSubject.asObservable();
  public activePage$: Observable<string> = this.activePageSubject.asObservable();
  public activeFilters$: Observable<{ pageKey: string; filters: Record<string, any> }> = this.activeFiltersSubject.asObservable();

  private cachedResults: Record<string, any[]> = {};

  dispatchFilter(command: AvatarFilterCommand) {
    this.filterSubject.next(command);
  }

  publishResults(pageKey: string, rows: any[]) {
    this.cachedResults[pageKey] = rows || [];
    this.resultsSubject.next({ pageKey, rows: this.cachedResults[pageKey] });
  }

  publishActiveFilters(pageKey: string, filters: Record<string, any>) {
    this.activeFiltersSubject.next({ pageKey, filters });
  }

  getResults(pageKey: string): any[] {
    return this.cachedResults[pageKey] || [];
  }

  setActivePage(pageKey: string) {
    this.activePageSubject.next(pageKey);
  }
}
