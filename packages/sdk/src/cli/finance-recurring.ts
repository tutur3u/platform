import type { FinanceCommandInput } from './finance';
import { paginateFinanceArray } from './finance-pagination';
import {
  getFinancePositionalName,
  getRecurringPayload,
  parseFinanceNumber,
  pickFinanceString,
} from './finance-payloads';
import { render } from './render';

function getRequiredRecurringId(action: string, id?: string) {
  if (id) return id;
  throw new Error(`Missing recurring id for finance ${action}.`);
}

export async function handleRecurring(
  input: FinanceCommandInput,
  action: string
) {
  const { client, flags, json, positionals, workspaceId } = input;
  const id = positionals[3];

  if (action === 'list') {
    render(
      paginateFinanceArray(
        await client.finance.listRecurringTransactions(workspaceId),
        flags
      ),
      {
        financeResource: 'recurring',
        group: 'finance',
        json,
      }
    );
    return;
  }

  if (action === 'upcoming') {
    render(
      await client.finance.listUpcomingRecurringTransactions(workspaceId, {
        daysAhead: parseFinanceNumber(pickFinanceString(flags, 'days-ahead')),
      }),
      { financeResource: 'upcoming-recurring', group: 'finance', json }
    );
    return;
  }

  if (action === 'create') {
    render(
      await client.finance.createRecurringTransaction(
        workspaceId,
        getRecurringPayload(flags, getFinancePositionalName(positionals))
      ),
      { financeResource: 'recurring', group: 'finance', json }
    );
    return;
  }

  if (action === 'update') {
    render(
      await client.finance.updateRecurringTransaction(
        workspaceId,
        getRequiredRecurringId(action, id),
        getRecurringPayload(flags)
      ),
      { financeResource: 'recurring', group: 'finance', json }
    );
    return;
  }

  if (action === 'delete') {
    render(
      await client.finance.deleteRecurringTransaction(
        workspaceId,
        getRequiredRecurringId(action, id)
      ),
      { financeResource: 'recurring', group: 'finance', json }
    );
    return;
  }

  throw new Error(`Unknown finance recurring action: ${action}`);
}
