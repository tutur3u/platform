import { Badge } from '@tuturuuu/ui/badge';
import { Switch } from '@tuturuuu/ui/switch';
import { useState } from 'react';
import { toneBadge } from '../components/tone';
import { useSetFleetStopped } from './owner-queries';
import {
  ChangeNotice,
  ConfirmDialog,
  changeState,
  OwnerSection,
} from './owner-parts';
import { Panel } from './query-message';
import { useFleetText } from './text';

/** The Fleet stop switch. Each direction confirms before it applies. */
export function FleetControl({
  stopped,
  generation,
}: {
  stopped: boolean;
  generation: string;
}) {
  const { t } = useFleetText();
  const mutation = useSetFleetStopped();
  const [confirming, setConfirming] = useState(false);
  const change = changeState(mutation, () => '');
  return (
    <OwnerSection id="fleet-control" title={t.access.control}>
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-5">
          <div className="min-w-0 space-y-1">
            <Badge
              variant="outline"
              className={toneBadge(stopped ? 'red' : 'green')}
            >
              {stopped ? t.access.stateStopped : t.access.stateRunning}
            </Badge>
            {stopped && (
              <p className="text-muted-foreground text-sm">
                {t.access.stopped}
              </p>
            )}
            {change.kind === 'refused' && <ChangeNotice state={change} />}
          </div>
          <Switch
            aria-label={t.access.switch}
            checked={!stopped}
            disabled={change.kind === 'saving'}
            onCheckedChange={() => setConfirming(true)}
          />
        </div>
      </Panel>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={stopped ? t.access.resumeTitle : t.access.stopTitle}
        action={stopped ? t.access.resume : t.access.stop}
        destructive={!stopped}
        onConfirm={() =>
          mutation.mutate({ stopped: !stopped, expectedGeneration: generation })
        }
      >
        <p>{stopped ? t.access.resumeBody : t.access.stopBody}</p>
      </ConfirmDialog>
    </OwnerSection>
  );
}
