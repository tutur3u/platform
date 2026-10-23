import { accountKey } from './accounts';
import type { AdmissionContext } from './hooks-types';
import { SIGNAL_TTL_MS } from './policy';
import { coversModel } from './window-scope';
export function clearRecoveredLimits(context: AdmissionContext) {
  for (const event of context.ledger.observations) {
    if (
      event.outcome !== 'usage-limit' ||
      event.clearedAt ||
      (event.resetsAt && Date.parse(event.resetsAt) > context.now.getTime())
    )
      continue;
    if (event.resetsAt && Date.parse(event.resetsAt) <= context.now.getTime()) {
      event.clearedAt = context.now.toISOString();
      continue;
    }
    const account = context.accounts.find(
      (account) =>
        account.instanceId === event.instanceId ||
        accountKey(account) === event.accountKey
    );
    if (!account) continue;
    const windows = account.windows.filter((window) =>
      coversModel(window, event.model)
    );
    if (
      windows.length &&
      windows.every(
        (window) =>
          window.authoritative &&
          typeof window.usedPercent === 'number' &&
          window.usedPercent < 100 &&
          Date.parse(window.observedAt) > Date.parse(event.observedAt) &&
          (!event.resetsAt ||
            Date.parse(window.observedAt) >= Date.parse(event.resetsAt)) &&
          Date.parse(window.observedAt) <= context.now.getTime() &&
          context.now.getTime() - Date.parse(window.observedAt) <=
            SIGNAL_TTL_MS[account.provider] &&
          Boolean(
            window.resetsAt &&
              Date.parse(window.resetsAt) > context.now.getTime()
          )
      )
    )
      event.clearedAt = context.now.toISOString();
  }
}
