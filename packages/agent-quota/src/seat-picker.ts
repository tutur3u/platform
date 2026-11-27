import { recommend } from './policy';
import type { TaskKind } from './types';

type Options = Parameters<typeof recommend>[0];

export function pickSeat(
  options: Options,
  role: string,
  modelClass: string | undefined,
  authorInstanceId: string | undefined
) {
  const kinds: Record<string, TaskKind> = {
    lead: 'analysis',
    builder: 'implementation',
    reviewer: 'review',
  };
  if (!Object.hasOwn(kinds, role)) throw new Error('Invalid seat role.');
  if (role === 'reviewer' && !authorInstanceId)
    throw new Error('Reviewer selection requires --author-instance.');
  const author = options.accounts.find(
    (account) => account.instanceId === authorInstanceId
  );
  const accounts = options.accounts.filter(
    (account) =>
      role !== 'reviewer' ||
      (account.instanceId !== authorInstanceId &&
        (!author?.accountIdentityHash ||
          account.accountIdentityHash !== author.accountIdentityHash))
  );
  const models = new Set(accounts.flatMap((account) => account.models ?? []));
  const ranked = [...models]
    .filter(
      (model) =>
        !/fable/i.test(model) &&
        (!modelClass || model.startsWith(modelClass)) &&
        (!options.task.model || options.task.model === model)
    )
    .flatMap((model) =>
      recommend({
        ...options,
        count: 1,
        accounts: accounts.map((account) => ({
          ...account,
          available:
            account.available === true &&
            account.models?.includes(model) === true &&
            (account.provider !== 'cursor' || model === 'default'),
        })),
        task: { ...options.task, kind: kinds[role], model, allowFable: false },
      }).selected.map((seat) => ({ ...seat, model }))
    );
  return ranked.sort((a, b) => b.score - a.score)[0] ?? null;
}
