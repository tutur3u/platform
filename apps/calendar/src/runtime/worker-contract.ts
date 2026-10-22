export interface CalendarWorkerEnvironment {
  ASSETS: { fetch(request: Request): Promise<Response> };
}
export interface CalendarExecutionContext {
  waitUntil(work: Promise<unknown>): void;
}
