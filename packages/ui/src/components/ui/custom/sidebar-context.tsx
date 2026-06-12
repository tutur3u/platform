'use client';

import { useLocalStorage } from '@tuturuuu/ui/hooks/use-local-storage';
import { setCookie } from 'cookies-next';
import {
  type ComponentType,
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

export const SIDEBAR_BEHAVIOR_COOKIE_NAME = 'sidebar-behavior';
export const SIDEBAR_BEHAVIOR_UPDATED_AT_COOKIE_NAME =
  'sidebar-behavior-updated-at';
export const SIDEBAR_BEHAVIOR_CONFIG_KEY = 'SIDEBAR_BEHAVIOR';

export type SidebarBehavior = 'expanded' | 'collapsed' | 'hover';

interface SidebarContextProps {
  behavior: SidebarBehavior;
  setBehavior: Dispatch<SetStateAction<SidebarBehavior>>;
  handleBehaviorChange: (newBehavior: SidebarBehavior) => void;
  /** Whether this browser uses a local override instead of the account-wide setting */
  localOverride: boolean;
  setLocalOverride: (enabled: boolean) => void;
}

export const SidebarContext = createContext<SidebarContextProps | undefined>(
  undefined
);

// Persistent cookie options — ensures setting survives browser restarts
export const SIDEBAR_COOKIE_OPTIONS = {
  maxAge: 365 * 24 * 60 * 60,
  path: '/',
} as const;

function parseSidebarBehaviorUpdatedAt(value: string | undefined | null) {
  if (!value) return null;

  const updatedAt = Number(value);
  return Number.isSafeInteger(updatedAt) && updatedAt > 0 ? updatedAt : null;
}

function getSidebarBehaviorUpdatedAtFromDocument() {
  if (typeof document === 'undefined') return null;

  const cookie = document.cookie
    .split('; ')
    .find((part) =>
      part.startsWith(`${SIDEBAR_BEHAVIOR_UPDATED_AT_COOKIE_NAME}=`)
    );

  if (!cookie) return null;

  return parseSidebarBehaviorUpdatedAt(
    decodeURIComponent(cookie.split('=').slice(1).join('='))
  );
}

type SidebarRemoteBehaviorBridgeComponent = ComponentType<{
  behavior: SidebarBehavior;
  localOverride: boolean;
  localOverrideVersion: number;
  onApplyRemoteBehavior: (newBehavior: SidebarBehavior) => void;
  onRemoteBehaviorAvailable: (remoteBehavior: SidebarBehavior) => void;
  behaviorUpdatedAt: number | null;
  userChangeVersion: number;
}>;

function useSidebarRemoteBehaviorBridge() {
  const [RemoteBehaviorBridge, setRemoteBehaviorBridge] =
    useState<SidebarRemoteBehaviorBridgeComponent | null>(null);

  useEffect(() => {
    let active = true;

    // biome-ignore lint/suspicious/noTsIgnore: NodeNext requires .js, but Next/Turbopack resolves workspace TypeScript source here before package emit.
    // @ts-ignore
    void import('./sidebar-remote-behavior-bridge').then((module) => {
      if (active) {
        setRemoteBehaviorBridge(() => module.SidebarRemoteBehaviorBridge);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  return RemoteBehaviorBridge;
}

export const SidebarProvider = ({
  children,
  initialBehavior,
  initialBehaviorUpdatedAt,
}: {
  children: ReactNode;
  initialBehavior: SidebarBehavior;
  initialBehaviorUpdatedAt?: number | null;
}) => {
  const [behavior, setBehavior] = useState<SidebarBehavior>(initialBehavior);
  const [behaviorUpdatedAt, setBehaviorUpdatedAt] = useState<number | null>(
    () => initialBehaviorUpdatedAt ?? getSidebarBehaviorUpdatedAtFromDocument()
  );
  const [localOverride, setLocalOverrideRaw] = useLocalStorage(
    'sidebar-local-override',
    false
  );
  const [remoteBehavior, setRemoteBehavior] = useState<SidebarBehavior | null>(
    null
  );
  const [userChangeVersion, setUserChangeVersion] = useState(0);
  const [localOverrideVersion, setLocalOverrideVersion] = useState(0);
  const RemoteBehaviorBridge = useSidebarRemoteBehaviorBridge();

  useEffect(() => {
    if (initialBehaviorUpdatedAt !== undefined) return;

    const updatedAt = getSidebarBehaviorUpdatedAtFromDocument();
    if (updatedAt !== null) setBehaviorUpdatedAt(updatedAt);
  }, [initialBehaviorUpdatedAt]);

  const applyBehavior = useCallback(
    (
      newBehavior: SidebarBehavior,
      options: { markLocalChange?: boolean } = {}
    ) => {
      setBehavior(newBehavior);
      setCookie(
        SIDEBAR_BEHAVIOR_COOKIE_NAME,
        newBehavior,
        SIDEBAR_COOKIE_OPTIONS
      );

      if (!options.markLocalChange) return;

      const updatedAt = Date.now();
      setBehaviorUpdatedAt(updatedAt);
      setCookie(
        SIDEBAR_BEHAVIOR_UPDATED_AT_COOKIE_NAME,
        String(updatedAt),
        SIDEBAR_COOKIE_OPTIONS
      );
    },
    []
  );

  const handleBehaviorChange = useCallback(
    (newBehavior: SidebarBehavior) => {
      applyBehavior(newBehavior, { markLocalChange: true });

      if (!localOverride) {
        setUserChangeVersion((version) => version + 1);
      }
    },
    [applyBehavior, localOverride]
  );

  const setLocalOverride = useCallback(
    (enabled: boolean) => {
      setLocalOverrideRaw(enabled);
      setLocalOverrideVersion((version) => version + 1);

      if (!enabled && remoteBehavior) {
        applyBehavior(remoteBehavior);
      }
    },
    [applyBehavior, remoteBehavior, setLocalOverrideRaw]
  );

  return (
    <SidebarContext.Provider
      value={{
        behavior,
        setBehavior,
        handleBehaviorChange,
        localOverride,
        setLocalOverride,
      }}
    >
      {RemoteBehaviorBridge && (
        <RemoteBehaviorBridge
          behavior={behavior}
          behaviorUpdatedAt={behaviorUpdatedAt}
          localOverride={localOverride}
          localOverrideVersion={localOverrideVersion}
          onApplyRemoteBehavior={applyBehavior}
          onRemoteBehaviorAvailable={setRemoteBehavior}
          userChangeVersion={userChangeVersion}
        />
      )}
      {children}
    </SidebarContext.Provider>
  );
};

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (context === undefined) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return context;
};
