import {
  type ExceededModeFormConfig,
  type UseMissedEntryFormConfig,
  type UseMissedEntryFormReturn,
  useMissedEntryForm as useSharedMissedEntryForm,
} from '@tuturuuu/hooks';
import { useWorkspaceConfig } from '@tuturuuu/ui/hooks/use-workspace-config';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useSessionActions } from '../session-history/use-session-actions';
import type {
  ExceededSessionChainModeProps,
  ExceededSessionModeProps,
  MissedEntryDialogProps,
  NormalModeProps,
} from './types';

export function useMissedEntryForm(
  props: MissedEntryDialogProps
): UseMissedEntryFormReturn {
  const { open, onOpenChange, wsId, mode = 'normal' } = props;

  const router = useRouter();
  const t = useTranslations('time-tracker.missed_entry_dialog');

  // Fetch workspace configuration for future sessions
  const configId = 'ALLOW_FUTURE_SESSIONS';
  const { data: configValue } = useWorkspaceConfig<string>(
    wsId,
    configId,
    'false'
  );
  const allowFutureSessions = configValue === 'true';

  // Validation helper
  const { getValidationErrorMessage } = useSessionActions({
    wsId,
  });

  // Build config for shared hook with proper type narrowing
  const config: UseMissedEntryFormConfig =
    mode === 'exceeded-session' || mode === 'exceeded-session-chain'
      ? ({
          wsId,
          mode,
          allowFutureSessions,
          session: (
            props as ExceededSessionModeProps | ExceededSessionChainModeProps
          ).session,
          breakTypeId: (
            props as ExceededSessionModeProps | ExceededSessionChainModeProps
          ).breakTypeId,
          breakTypeName: (
            props as ExceededSessionModeProps | ExceededSessionChainModeProps
          ).breakTypeName,
        } as ExceededModeFormConfig)
      : {
          wsId,
          mode: 'normal' as const,
          allowFutureSessions,
          prefillStartTime: (props as NormalModeProps).prefillStartTime,
          prefillEndTime: (props as NormalModeProps).prefillEndTime,
        };

  // Use shared hook
  return useSharedMissedEntryForm(open, config, {
    onOpenChange,
    onSuccess: (message) => {
      router.refresh();
      toast.success(
        t(
          message === 'Entry added successfully'
            ? 'success.entryAdded'
            : 'success.requestSubmitted'
        )
      );

      if (mode === 'exceeded-session' || mode === 'exceeded-session-chain') {
        const exceededProps = props as
          | ExceededSessionModeProps
          | ExceededSessionChainModeProps;
        const wasBreakPause = !!(
          exceededProps.breakTypeId || exceededProps.breakTypeName
        );
        exceededProps.onMissedEntryCreated?.(wasBreakPause);
      }
    },
    onError: (message) => {
      toast.error(message);
    },
    refreshData: () => {
      router.refresh();
    },
    getValidationErrorMessage,
  });
}
