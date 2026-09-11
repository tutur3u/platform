import type { ColabRoom } from './room';
import type { SponsorshipContext } from './sponsored-ai';
export interface Env {
  ROOMS: DurableObjectNamespace<ColabRoom>;
  AI: Ai;
  ASSETS: Fetcher;
  COLAB_SESSION_SECRET: string;
  APP_ORIGIN: string;
  AUTH_ORIGIN: string;
  COLAB_AI_API_KEY?: string;
  authorizeSponsorship?: (body: string) => Promise<string>;
  COLAB_AI_MODEL?: string;
  COLAB_REQUIRE_SPONSORSHIP?: string;
  sponsorship?: SponsorshipContext;
}
