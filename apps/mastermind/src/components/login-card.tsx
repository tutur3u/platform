import { Copy, ExternalLink } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import { useState } from 'react';
import { useAnswer } from '../fleet/answer';
import type {
  FleetDecision,
  FleetLogin,
  FleetLoginState,
} from '../fleet/contract';
import { formatRemaining } from '../fleet/model';
import { useI18n } from '../i18n';
import { AnswerOutcome } from './ask-outcome';
import { Facts } from './section';
import { type Tone, toneBadge } from './tone';

const STATE_TONE: Record<FleetLoginState, Tone> = {
  waiting: 'orange',
  approved: 'blue',
  verified: 'green',
  expired: 'gray',
  failed: 'red',
};
const STEPS = ['waiting', 'approved', 'verified'] as const;

function Stepper({ state }: { state: FleetLoginState }) {
  const { t } = useI18n();
  const reached = STEPS.indexOf(state as (typeof STEPS)[number]);
  return (
    <ol className="grid grid-cols-3 gap-2 text-xs">
      {STEPS.map((step, index) => (
        <li
          key={step}
          aria-current={index === reached ? 'step' : undefined}
          className={cn(
            'border-t-2 pt-2 font-medium',
            index < reached || state === 'verified'
              ? 'border-dynamic-green text-foreground'
              : index === reached
                ? 'border-foreground font-semibold text-foreground'
                : 'border-border text-muted-foreground'
          )}
        >
          {t(`access.step.${step}`)}
        </li>
      ))}
    </ol>
  );
}

function CopyCode({ code }: { code: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() =>
        navigator.clipboard?.writeText(code).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          },
          () => setCopied(false)
        )
      }
    >
      <Copy />
      <span aria-live="polite">
        {copied ? t('access.copied') : t('access.copy')}
      </span>
    </Button>
  );
}

export function LoginCard({
  decision,
  login,
  state,
  machine,
  now,
  interactive,
}: {
  interactive: boolean;
  decision: FleetDecision;
  login: FleetLogin;
  state: FleetLoginState;
  machine?: string;
  now: number;
}) {
  const { t } = useI18n();
  const answer = useAnswer(decision.id);
  const open = state === 'waiting' || state === 'approved';
  const host = login.url ? new URL(login.url).host : undefined;
  const left = login.expiresAt ? Date.parse(login.expiresAt) - now : undefined;
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 p-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="grid size-10 flex-none place-items-center rounded-md border bg-muted font-mono font-semibold text-xs uppercase">
            {login.service.slice(0, 2)}
          </span>
          <div className="min-w-0 space-y-1">
            <CardTitle className="leading-snug">{decision.title}</CardTitle>
            <CardDescription>
              {[machine, decision.requester].filter(Boolean).join(' · ')}
            </CardDescription>
          </div>
        </div>
        <Badge variant="outline" className={toneBadge(STATE_TONE[state])}>
          {t(`access.state.${state}`)}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4 px-4 pb-4">
        <Facts
          rows={[
            [t('access.why'), decision.why ?? decision.body],
            [
              t('access.expiresLabel'),
              open && left !== undefined ? (
                <span key="expiry" className="font-mono tabular-nums">
                  {formatRemaining(left)}
                </span>
              ) : undefined,
            ],
          ]}
        />
        {open && login.flow === 'local_callback' && (
          <p className="text-sm">
            {t('access.localOnly', { machine: machine ?? '' })}
          </p>
        )}
        {open && login.url && (
          <div className="flex flex-wrap items-center gap-3">
            {login.userCode && (
              <>
                <code
                  aria-label={t('access.code')}
                  className="select-all rounded-md border bg-muted px-3.5 py-2 font-mono font-semibold text-xl tracking-widest"
                >
                  {login.userCode}
                </code>
                <CopyCode code={login.userCode} />
              </>
            )}
            <Button asChild size="sm">
              <a href={login.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink />
                {t('access.open', { host: host ?? '' })}
              </a>
            </Button>
            {!login.userCode && login.flow === 'link' && (
              <span className="text-muted-foreground text-sm">
                {t('access.noCode')}
              </span>
            )}
          </div>
        )}
        <Stepper state={state} />
      </CardContent>
      {open && interactive && (
        <CardFooter className="gap-2 border-t px-4 py-3">
          {answer.state.kind === 'idle' ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                answer.queue({ action: 'signed_in' }, { delay: 0 })
              }
            >
              {t('access.signedIn')}
            </Button>
          ) : answer.state.kind === 'sent' ? (
            <p className="text-muted-foreground text-sm">
              {t('access.signedInSent')}
            </p>
          ) : answer.state.kind === 'replying' ? null : (
            <AnswerOutcome
              state={answer.state}
              now={now}
              onUndo={answer.undo}
              onCheck={() => void answer.check()}
            />
          )}
        </CardFooter>
      )}
    </Card>
  );
}
