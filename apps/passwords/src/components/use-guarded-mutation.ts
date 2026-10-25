import { useMutation } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { toast } from '@tuturuuu/ui/sonner';
import { useI18n } from '../i18n/provider';
import { operationJournal, type WriteAction } from '../lib/operation-journal';
import {
  asClientError,
  PasswordsClientError as ClientError,
  type PasswordsClientError,
  unwrap,
} from '../service/client-error';
import { observeOperation } from '../service/functions';
import type { PasswordsResult } from '../service/port';

interface Options<Args, Value> {
  intent(args: Args): string;
  write?: { wsId: string; vaultId?: string; action: WriteAction };
  run(args: Args, requestId: string): Promise<PasswordsResult<Value>>;
  onSuccess?(value: Value, args: Args): void;
  reload?: boolean;
}

export function useGuardedMutation<Args, Value>(options: Options<Args, Value>) {
  const { t } = useI18n();
  const router = useRouter();

  return useMutation<Value, PasswordsClientError, Args>({
    // Revealed bytes must not outlive the component in the mutation cache.
    gcTime: 0,
    retry: false,
    mutationFn: async (args) => {
      let journal: ReturnType<typeof operationJournal> | undefined;
      const requestId = crypto.randomUUID();
      if (options.write) {
        try {
          journal = operationJournal(sessionStorage, options.write.wsId);
          const pending = journal.read();
          if (pending) {
            const observation = unwrap(
              await observeOperation({
                data: {
                  wsId: pending.wsId,
                  vaultId: pending.vaultId,
                  targetRequestId: pending.requestId,
                },
              })
            );
            if (!observation.found || observation.action !== pending.action)
              throw new ClientError('OPERATION_UNCERTAIN');
            journal.complete(pending.requestId);
            // Refresh committed state. A fresh user submission is required for a new write.
            throw new ClientError('REVISION_CONFLICT');
          }
          journal.begin({
            ...options.write,
            vaultId: options.write.vaultId ?? requestId,
            requestId,
          });
        } catch (error) {
          throw error instanceof ClientError
            ? error
            : new ClientError('OPERATION_UNCERTAIN');
        }
      }
      try {
        const value = unwrap(await options.run(args, requestId));
        journal?.complete(requestId);
        return value;
      } catch (error) {
        const failure = asClientError(error, Boolean(options.write));
        if (failure.code !== 'OPERATION_UNCERTAIN') {
          try {
            journal?.complete(requestId);
          } catch {
            throw new ClientError('OPERATION_UNCERTAIN');
          }
        }
        throw failure;
      }
    },
    onSuccess: async (value, args) => {
      options.onSuccess?.(value, args);
      if (options.reload !== false) await router.invalidate();
    },
    onError: async (error) => {
      if (error.code === 'REVISION_CONFLICT') await router.invalidate();
      if (error.code !== 'STEP_UP_REQUIRED')
        toast.error(t(`errors.${error.code}`));
    },
  });
}
