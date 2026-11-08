'use client';

import { Switch } from '@tuturuuu/ui/switch';
import { useRef, useState, useTransition } from 'react';
import { mutateFeatureFlag, reconcileFeatureFlag } from './actions';

interface ToggleCopy {
  conflict: string;
  error: string;
  loading: string;
  off: string;
  on: string;
  reconcile: string;
  reset: string;
  unknown: string;
}

export function FeatureFlagToggle({
  copy,
  declaredDefault,
  environment,
  expectedRevision,
  flagKey,
  overrideEnabled,
}: {
  copy: ToggleCopy;
  declaredDefault: boolean;
  environment: string;
  expectedRevision: number;
  flagKey: string;
  overrideEnabled: boolean | null;
}) {
  const operationId = useRef(crypto.randomUUID());
  const [override, setOverride] = useState(overrideEnabled);
  const [revision, setRevision] = useState(expectedRevision);
  const [notice, setNotice] = useState<null | 'conflict' | 'error' | 'unknown'>(
    null
  );
  const [pending, startTransition] = useTransition();
  const locked = pending || notice === 'unknown' || notice === 'conflict';

  function submit(next: boolean | null) {
    if (locked) return;
    const id = operationId.current;
    startTransition(async () => {
      const result = await mutateFeatureFlag({
        environment,
        expectedRevision: revision,
        flagKey,
        operationId: id,
        overrideEnabled: next,
      });
      if (result.status === 'unknown') {
        setNotice('unknown');
        return;
      }
      if (
        (result.status === 'applied' || result.status === 'replayed') &&
        result.matchesRequest === false
      ) {
        setNotice('error');
        return;
      }
      if (
        result.status === 'applied' ||
        result.status === 'noop' ||
        result.status === 'replayed'
      ) {
        setOverride(result.overrideEnabled ?? null);
        setRevision(result.revision ?? revision);
        setNotice(null);
        operationId.current = crypto.randomUUID();
        return;
      }
      setNotice(result.status === 'conflict' ? 'conflict' : 'error');
    });
  }

  function reconcile() {
    const id = operationId.current;
    startTransition(async () => {
      const result = await reconcileFeatureFlag(id);
      if (result.status === 'found') {
        setOverride(result.overrideEnabled);
        setRevision(result.revision);
        setNotice(null);
        operationId.current = crypto.randomUUID();
        return;
      }
      if (result.status === 'absent') {
        setNotice(null);
        return;
      }
      setNotice('unknown');
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Switch
        aria-label={`${flagKey} ${environment}`}
        checked={override ?? declaredDefault}
        disabled={locked}
        onCheckedChange={(checked) => submit(checked)}
      />
      <span className="text-muted-foreground text-xs">
        {pending
          ? copy.loading
          : (override ?? declaredDefault)
            ? copy.on
            : copy.off}
      </span>
      {override !== null ? (
        <button
          className="text-xs underline disabled:opacity-50"
          disabled={locked}
          onClick={() => submit(null)}
          type="button"
        >
          {copy.reset}
        </button>
      ) : null}
      {notice === 'conflict' ? (
        <p className="text-muted-foreground text-xs">{copy.conflict}</p>
      ) : null}
      {notice === 'error' ? (
        <p className="text-muted-foreground text-xs">{copy.error}</p>
      ) : null}
      {notice === 'unknown' ? (
        <div className="flex flex-col items-start gap-1">
          <p className="text-muted-foreground text-xs">{copy.unknown}</p>
          <button
            className="text-xs underline disabled:opacity-50"
            disabled={pending}
            onClick={reconcile}
            type="button"
          >
            {copy.reconcile}
          </button>
        </div>
      ) : null}
    </div>
  );
}
