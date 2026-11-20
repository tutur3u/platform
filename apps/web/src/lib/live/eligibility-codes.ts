/** Mint-cap refusals that mean the actor or free budget hit its limit. */
export const LIVE_LIMIT_CODES: ReadonlySet<string> = new Set([
  'FREE_LIVE_DAILY_BUDGET_EXHAUSTED',
  'LIVE_MINT_ACTOR_LIMIT',
]);
