import type {
  FleetLinkConfirmation,
  FleetLinkConfirmationInput,
} from '@tuturuuu/internal-api/fleet';
import { fleetLinkConfirmationInputSchema } from '@tuturuuu/internal-api/fleet';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { type FormEvent, useState } from 'react';
import { toneBadge } from '../components/tone';
import { TextField } from './fields';
import { LinkCode } from './link-code';
import { Panel } from './query-message';
import { useConfirmFleetLink } from './queries';
import { useFleetText } from './text';
import type { FleetRefusal } from './upstream';

type Display = Pick<FleetLinkConfirmation, 'channel' | 'accountLabel'>;
type Proof = Omit<FleetLinkConfirmationInput, 'preview'>;

export type LinkState =
  | { kind: 'entry'; refusal?: FleetRefusal }
  | { kind: 'checking' }
  | {
      kind: 'pending';
      proof: Proof;
      display: Display;
      refusal?: FleetRefusal;
    }
  | { kind: 'linking'; proof: Proof; display: Display }
  | { kind: 'linked'; display: Display };

export function LinkIdentityTab() {
  const [round, setRound] = useState(0);
  return (
    <Panel>
      <LinkCode onIssued={() => setRound((value) => value + 1)} />
      {/* A new code voids any pending link, so confirmation starts over. */}
      <LinkConfirmation key={round} />
    </Panel>
  );
}

function LinkConfirmation() {
  const { t } = useFleetText();
  const confirm = useConfirmFleetLink();
  const [proof, setProof] = useState<Proof>({
    linkId: '',
    confirmationCode: '',
  });
  const [pending, setPending] = useState<Display>();
  const [invalid, setInvalid] = useState(false);
  const state = linkState(confirm, proof, pending);

  const check = (event: FormEvent) => {
    event.preventDefault();
    const parsed = fleetLinkConfirmationInputSchema.safeParse({
      linkId: proof.linkId.trim(),
      confirmationCode: proof.confirmationCode.trim(),
    });
    setInvalid(!parsed.success);
    if (!parsed.success) return;
    setProof(parsed.data);
    confirm.mutate(
      { ...parsed.data, preview: true },
      {
        onSuccess: (result) => {
          if (result.kind === 'ok') setPending(result.data);
        },
      }
    );
  };

  switch (state.kind) {
    case 'entry':
    case 'checking':
      return (
        <form
          onSubmit={check}
          noValidate
          className="space-y-4 px-4 py-4 md:px-5"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id="fleet-link-id"
              label={t.link.linkId}
              value={proof.linkId}
              mono
              error={invalid ? t.refusal.invalid_confirmation : undefined}
              onChange={(linkId) => setProof({ ...proof, linkId })}
            />
            <TextField
              id="fleet-link-confirmation"
              label={t.link.confirmation}
              value={proof.confirmationCode}
              mono
              onChange={(confirmationCode) =>
                setProof({ ...proof, confirmationCode })
              }
            />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            {state.kind === 'entry' && state.refusal && (
              <p role="alert" className="mr-auto text-destructive text-sm">
                {t.refusal[state.refusal]}
              </p>
            )}
            <Button type="submit" disabled={state.kind === 'checking'}>
              {t.link.preview}
            </Button>
          </div>
        </form>
      );
    case 'pending':
    case 'linking':
      return (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-5">
          <LinkDisplay display={state.display} badge={t.link.pending} />
          {state.kind === 'pending' && state.refusal && (
            <p role="alert" className="w-full text-destructive text-sm">
              {t.refusal[state.refusal]}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              variant="ghost"
              disabled={state.kind === 'linking'}
              onClick={() => {
                confirm.reset();
                setPending(undefined);
              }}
            >
              {t.link.change}
            </Button>
            <Button
              disabled={state.kind === 'linking'}
              onClick={() => confirm.mutate(state.proof)}
            >
              {t.link.confirm}
            </Button>
          </div>
        </div>
      );
    case 'linked':
      return (
        <div className="px-4 py-4 md:px-5">
          <LinkDisplay display={state.display} badge={t.link.linked} linked />
        </div>
      );
  }
}

export function linkState(
  confirm: Pick<
    ReturnType<typeof useConfirmFleetLink>,
    'isPending' | 'isError' | 'data'
  >,
  proof: Proof,
  pending: Display | undefined
): LinkState {
  const result = confirm.data;
  if (result?.kind === 'ok' && result.data.linked) {
    return { kind: 'linked', display: result.data };
  }
  const refusal = confirm.isError
    ? 'unavailable'
    : result?.kind === 'refused'
      ? result.reason
      : undefined;
  if (pending) {
    return confirm.isPending
      ? { kind: 'linking', proof, display: pending }
      : { kind: 'pending', proof, display: pending, refusal };
  }
  if (confirm.isPending) return { kind: 'checking' };
  return { kind: 'entry', refusal };
}

function LinkDisplay({
  display,
  badge,
  linked,
}: {
  display: Display;
  badge: string;
  linked?: boolean;
}) {
  const { t } = useFleetText();
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
      <span className="font-medium">{t.channel[display.channel]}</span>
      <span className="min-w-0 break-words text-muted-foreground">
        {display.accountLabel}
      </span>
      <Badge
        variant="outline"
        className={toneBadge(linked ? 'green' : 'yellow')}
      >
        {badge}
      </Badge>
    </div>
  );
}
