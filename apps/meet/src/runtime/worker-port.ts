// The browser/SSR project uses Web types. The Worker project checks these same
// declarations against its real generated bindings and Workers runtime types.
export interface MeetRuntimeBindings {
  ASSETS?: { fetch(request: Request): Promise<Response> };
}

export interface MeetExecutionContext {
  waitUntil(work: Promise<unknown>): void;
}
