import type { FleetDecision, FleetState } from './contract';
import { effectiveLoginState } from './login';
import { SECRET_ANSWER_CUTOFF_MS } from './secret-contract';

/**
 * Header a client sends to declare optional snapshot features it can render,
 * as a comma-separated list. `login` = access-request cards with the
 * `signed_in` answer; `review` = design-review cards with the
 * `request_changes` answer; `secret` = secret requests and pairings with the
 * `secret`, `decline` and `pair` answers.
 */
export const FLEET_FEATURES_HEADER = 'x-mastermind-fleet-features';

export function parseFleetFeatures(value: string | null) {
  return new Set(
    (value ?? '')
      .split(',')
      .map((feature) => feature.trim().toLowerCase())
      .filter(Boolean)
  );
}

/**
 * What an owner client sees of the stored snapshot at `now`:
 * - a login request past its expiry reads as expired and loses its link and
 *   code, even when the publisher has stopped and the stored copy is old;
 * - clients without the `login` feature never see login requests, because
 *   their Approve and Hold would be refused and their parser would drop the
 *   `signed_in` receipt;
 * - clients without the `review` feature never see design reviews, which
 *   they would show without the preview, the mockup link or Request changes;
 * - clients without the `secret` feature never see secret requests or their
 *   outcomes, and a secret request or pairing reads closed (it leaves the
 *   list, keys and all) once Web stops taking answers for it, 15 seconds
 *   before it expires.
 */
export function fleetStateView(
  state: FleetState,
  { now = new Date(), features = new Set<string>() } = {}
): FleetState {
  const visible = ({ kind }: { kind: string }) =>
    (kind !== 'login' || features.has('login')) &&
    (kind !== 'review' || features.has('review')) &&
    (kind !== 'secret' || features.has('secret'));
  const open = ({ secret }: FleetDecision) =>
    !secret ||
    now.getTime() <= Date.parse(secret.expiresAt) - SECRET_ANSWER_CUTOFF_MS;
  return {
    ...state,
    decisions: state.decisions
      .filter((decision) => visible(decision) && open(decision))
      .map((decision) => {
        if (!decision.login) return decision;
        const effective = effectiveLoginState(decision.login, now);
        if (effective === decision.login.state) return decision;
        const { url: _url, userCode: _userCode, ...rest } = decision.login;
        return { ...decision, login: { ...rest, state: effective } };
      }),
    ...(state.resolved
      ? {
          resolved: state.resolved.filter(visible),
        }
      : {}),
  };
}
