export interface MailRuntimeEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
}
export interface MailExecutionContext {
  waitUntil(work: Promise<unknown>): void;
}
