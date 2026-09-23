import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';

export interface AvatarFilterCommand {
  pageKey: string;
  filters: Record<string, any>;
  page?: number | string;
  sort?: { field: string; direction: 'asc' | 'desc'; column?: string; order?: 'asc' | 'desc'; label?: string };
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  reset?: boolean;
  message?: string;
}

export interface AvatarClickCommand {
  type: 'click';
  target?: string;
  element?: string;
  action_type?: string;
  row_number?: number;
  row_index?: number;
  row_identifier?: string;
  message?: string;
}

export interface AvatarCreateRequestCommand {
  type: 'create_request';
  request_text?: string;
  text?: string;
  result?: any;
  requestId?: string;
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
  private clickSubject = new Subject<AvatarClickCommand>();
  private createRequestSubject = new Subject<AvatarCreateRequestCommand>();

  private activeFiltersSubject = new Subject<{ pageKey: string; filters: Record<string, any> }>();

  public filterEvents$: Observable<AvatarFilterCommand> = this.filterSubject.asObservable();
  public resultsEvents$: Observable<TableResultsEvent> = this.resultsSubject.asObservable();
  public activePage$: Observable<string> = this.activePageSubject.asObservable();
  public activeFilters$: Observable<{ pageKey: string; filters: Record<string, any> }> = this.activeFiltersSubject.asObservable();
  public clickEvents$: Observable<AvatarClickCommand> = this.clickSubject.asObservable();
  public createRequestEvents$: Observable<AvatarCreateRequestCommand> = this.createRequestSubject.asObservable();

  private cachedResults: Record<string, any[]> = {};

  dispatchFilter(command: AvatarFilterCommand) {
    this.filterSubject.next(command);
  }

  dispatchClick(command: AvatarClickCommand) {
    this.clickSubject.next(command);
  }

  dispatchCreateRequest(command: AvatarCreateRequestCommand) {
    this.createRequestSubject.next(command);
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
