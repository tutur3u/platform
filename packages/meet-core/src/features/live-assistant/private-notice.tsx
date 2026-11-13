'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Info, Loader2, RefreshCw } from '@tuturuuu/icons';
import {
  readPrivateMiraPolicy,
  setPrivateMiraChoice,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { useTranslations } from 'next-intl';
import { withDeadline } from './live-errors';
import {
  confirmPrivateChoice,
  type PrivateChoice,
  PrivateChoiceError,
  privateChoiceProblem,
} from './private-choice';

const CHOICE_DEADLINE_MS = 20000;
const LEAVE_RECORD_DEADLINE_MS = 4000;

export function PrivateMiraNotice({
  meetingId,
  connected = true,
  onStop,
  onLeave,
  onAccepted,
}: {
  meetingId: string;
  /** The room socket is open and this device is admitted, so the server can see its presence. */
  connected?: boolean;
  onStop: () => Promise<void>;
  onLeave: () => void | Promise<void>;
  onAccepted: (accepted: boolean) => void;
}) {
  const t = useTranslations('meet.live');
  const client = useQueryClient();
  const key = ['mira-private-choice', meetingId];
  const policy = useQuery({
    queryKey: key,
    queryFn: () => readPrivateMiraPolicy(meetingId),
    enabled: connected,
    retry: false,
  });
  const record = async (value: PrivateChoice) => {
    const current = policy.data ?? (await readPrivateMiraPolicy(meetingId));
    await setPrivateMiraChoice(meetingId, current.version, value);
    const confirmed = await readPrivateMiraPolicy(meetingId);
    client.setQueryData(key, confirmed);
    return confirmed;
  };
  const choice = useMutation({
    mutationFn: async (value: PrivateChoice) => {
      if (value === 'leave') {
        // Leaving never waits on consent storage: stop, record when possible, leave.
        await Promise.resolve()
          .then(onStop)
          .catch(() => undefined);
        if (connected)
          await withDeadline(
            record('leave'),
            LEAVE_RECORD_DEADLINE_MS,
            () => new PrivateChoiceError('timeout')
          ).catch(() => undefined);
        onAccepted(false);
        await onLeave();
        return;
      }
      if (!connected) throw new PrivateChoiceError('not_connected');
      if (value !== 'continue') await onStop();
      const confirmed = await withDeadline(
        record(value),
        CHOICE_DEADLINE_MS,
        () => new PrivateChoiceError('timeout')
      ).catch((error: unknown) => {
        if (value !== 'continue') onAccepted(false);
        throw error;
      });
      let accepted: boolean;
      try {
        accepted = confirmPrivateChoice(confirmed, value);
      } catch (error) {
        if (value !== 'continue') onAccepted(false);
        throw error;
      }
      onAccepted(accepted);
    },
  });
  const problem = !connected
    ? 'not_connected'
    : choice.isError
      ? privateChoiceProblem(choice.error)
      : policy.isError
        ? privateChoiceProblem(policy.error)
        : policy.data && !policy.data.available
          ? 'unavailable'
          : null;
  const retryable =
    problem && !['not_connected', 'unavailable'].includes(problem);
  const pending = choice.isPending ? choice.variables : undefined;
  const done =
    choice.isSuccess && choice.variables !== 'leave' ? choice.variables : null;
  const retry = () => {
    if (choice.isError && choice.variables) choice.mutate(choice.variables);
    else void policy.refetch();
  };
  const action = (value: PrivateChoice, label: string) => (
    <Button
      autoFocus={value === 'continue'}
      variant={
        value === 'continue'
          ? 'default'
          : value === 'mute'
            ? 'outline'
            : 'ghost'
      }
      aria-busy={pending === value}
      disabled={
        choice.isPending ||
        (value !== 'leave' && !connected) ||
        (value === 'continue' && policy.data?.available === false)
      }
      onClick={() => choice.mutate(value)}
    >
      {pending === value && <Loader2 className="size-4 animate-spin" />}
      {label}
    </Button>
  );
  return (
    <section className="space-y-2" aria-label={t('phase_notice_title')}>
      <div className="flex flex-wrap items-center gap-2">
        {action('continue', t('phase_continue'))}
        {action('mute', t('phase_mute'))}
        {action('leave', t('phase_leave'))}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto size-8"
              aria-label={t('phase_details')}
            >
              <Info className="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 space-y-2 text-sm">
            <p>{t('phase_notice')}</p>
            <p className="text-muted-foreground text-xs">
              {t('phase_retention')}
            </p>
            <a
              className="inline-block underline"
              href="https://tuturuuu.com/privacy"
              target="_blank"
              rel="noreferrer"
            >
              {t('phase_legal')}
            </a>
          </PopoverContent>
        </Popover>
      </div>
      {problem ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 text-destructive text-sm"
        >
          <span className="min-w-0 flex-1">{t(`choice_${problem}`)}</span>
          {retryable && (
            <Button
              variant="outline"
              size="sm"
              disabled={choice.isPending || policy.isFetching}
              onClick={retry}
            >
              <RefreshCw className="size-3.5" />
              {t('retry')}
            </Button>
          )}
        </div>
      ) : (
        done && (
          <p role="status" className="text-muted-foreground text-sm">
            {t(
              done === 'continue' ? 'choice_continue_done' : 'choice_mute_done'
            )}
          </p>
        )
      )}
    </section>
  );
}
