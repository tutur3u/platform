import type { ColabRoom } from './room';
export interface Env {
  ROOMS: DurableObjectNamespace<ColabRoom>;
  AI: Ai;
  ASSETS: Fetcher;
  COLAB_SESSION_SECRET: string;
  APP_ORIGIN: string;
  AUTH_ORIGIN: string;
}
