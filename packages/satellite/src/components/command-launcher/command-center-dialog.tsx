'use client';

import { Dialog } from '@tuturuuu/ui/dialog';
import { type RefObject, use, useMemo } from 'react';
import type { CommandCenterSessionRequest } from './command-center-host';
import { CommandCenterSession } from './command-center-session';
import type {
  GlobalCommandLauncherLabels,
  GlobalCommandLauncherProps,
} from './command-launcher-types';

export type CommandCenterDialogProps = Omit<
  GlobalCommandLauncherProps,
  'instancePriority'
> & {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pathname: string | null;
  returnFocusRef: RefObject<HTMLElement | null>;
  session: CommandCenterSessionRequest;
};

type LabelsLoader = () => Promise<Partial<GlobalCommandLauncherLabels>>;

const loadedLabels = new WeakMap<
  LabelsLoader,
  Promise<Partial<GlobalCommandLauncherLabels>>
>();

function resolveLabels(loader: LabelsLoader) {
  let pending = loadedLabels.get(loader);
  if (!pending) {
    // A failed bundle load keeps the explicit and default labels.
    pending = loader().catch(() => ({}));
    loadedLabels.set(loader, pending);
  }
  return pending;
}

/**
 * Lazily loaded body of the command center. Each open starts a fresh session
 * (query, scope, mode, highlighted row) from the open request.
 */
export default function CommandCenterDialog({
  labels,
  labelsLoader,
  onOpenChange,
  open,
  session,
  ...props
}: CommandCenterDialogProps) {
  const loaded = labelsLoader ? use(resolveLabels(labelsLoader)) : undefined;
  const mergedLabels = useMemo(
    () => (loaded ? { ...loaded, ...labels } : labels),
    [labels, loaded]
  );
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <CommandCenterSession
        {...props}
        key={session.id}
        labels={mergedLabels}
        onClose={() => onOpenChange(false)}
        open={open}
        options={session.options}
      />
    </Dialog>
  );
}
