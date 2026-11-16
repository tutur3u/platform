'use client';

import {
  QueryClient,
  QueryClientContext,
  QueryClientProvider,
} from '@tanstack/react-query';
import {
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  getActiveCommandCenterId,
  registerCommandCenterInstance,
  clearCommandCenterPreloader,
  setCommandCenterPreloader,
  subscribeCommandCenterRegistry,
  unregisterCommandCenterInstance,
} from './command-center-registry';
import type {
  CommandCenterOpenOptions,
  GlobalCommandLauncherProps,
} from './command-launcher-types';
import type { GlobalCommandLauncherAction } from './events';

let dialogModule: Promise<typeof import('./command-center-dialog')> | null =
  null;

/** Starts loading the dialog chunk; repeated calls share one request. */
export function preloadCommandCenter() {
  dialogModule ??= import('./command-center-dialog');
  return dialogModule;
}

const LazyCommandCenterDialog = lazy(() => preloadCommandCenter());

export type CommandCenterSessionRequest = {
  id: number;
  options: CommandCenterOpenOptions;
};

export type CommandCenterHostProps = GlobalCommandLauncherProps & {
  /** Current path; falls back to `window.location` when omitted. */
  pathname?: string | null;
};

/**
 * Framework-free command center shell. It stays in the host's initial chunk:
 * registration, the shared shortcut and open state. The dialog, result
 * queries and scoring load on first intent and render only while this
 * instance is the document's active center.
 */
export function CommandCenterHost({
  instancePriority = 0,
  pathname,
  ...props
}: CommandCenterHostProps) {
  const instanceId = useMemo(() => Symbol('CommandCenterHost'), []);
  // Roots without a query client (public or demo pages) get a private one.
  // Every launcher query is gated on a known actor, so it stays idle there.
  const hostQueryClient = useContext(QueryClientContext);
  const [ownQueryClient] = useState(() =>
    hostQueryClient ? null : new QueryClient()
  );
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [session, setSession] = useState<CommandCenterSessionRequest>({
    id: 0,
    options: {},
  });
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const isActive = useSyncExternalStore(
    subscribeCommandCenterRegistry,
    () => getActiveCommandCenterId() === instanceId,
    () => false
  );

  const openRef = useRef(false);
  const setOpenState = useCallback((next: boolean) => {
    openRef.current = next;
    setOpen(next);
  }, []);

  const handleAction = useCallback(
    (
      action: GlobalCommandLauncherAction,
      options: CommandCenterOpenOptions = {}
    ) => {
      if (action === 'close') {
        setOpenState(false);
        return;
      }
      if (openRef.current) {
        if (action === 'toggle') setOpenState(false);
        return;
      }
      returnFocusRef.current = options.returnFocus ?? null;
      setSession((current) => ({ id: current.id + 1, options }));
      setLoaded(true);
      setOpenState(true);
    },
    [setOpenState]
  );

  useEffect(() => {
    registerCommandCenterInstance(instanceId, instancePriority, handleAction);
    return () => unregisterCommandCenterInstance(instanceId);
  }, [handleAction, instanceId, instancePriority]);

  useEffect(() => {
    if (!isActive) {
      setOpenState(false);
      return;
    }
    const preload = () => {
      void preloadCommandCenter();
      setLoaded(true);
    };
    setCommandCenterPreloader(preload);
    return () => clearCommandCenterPreloader(preload);
  }, [isActive, setOpenState]);

  if (!isActive || !loaded) return null;

  const dialog = (
    <Suspense fallback={null}>
      <LazyCommandCenterDialog
        {...props}
        onOpenChange={setOpenState}
        open={open}
        pathname={
          pathname ??
          (typeof window === 'undefined' ? null : window.location.pathname)
        }
        returnFocusRef={returnFocusRef}
        session={session}
      />
    </Suspense>
  );

  return ownQueryClient ? (
    <QueryClientProvider client={ownQueryClient}>{dialog}</QueryClientProvider>
  ) : (
    dialog
  );
}
