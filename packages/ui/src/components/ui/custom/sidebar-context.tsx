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
const COOKIE_OPTIONS = { maxAge: 365 * 24 * 60 * 60, path: '/' } as const;

type SidebarRemoteBehaviorBridgeComponent = ComponentType<{
  behavior: SidebarBehavior;
  localOverride: boolean;
  localOverrideVersion: number;
  onApplyRemoteBehavior: (newBehavior: SidebarBehavior) => void;
  onRemoteBehaviorAvailable: (remoteBehavior: SidebarBehavior) => void;
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
}: {
  children: ReactNode;
  initialBehavior: SidebarBehavior;
}) => {
  const [behavior, setBehavior] = useState<SidebarBehavior>(initialBehavior);
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

  const applyBehavior = useCallback((newBehavior: SidebarBehavior) => {
    setBehavior(newBehavior);
    setCookie(SIDEBAR_BEHAVIOR_COOKIE_NAME, newBehavior, COOKIE_OPTIONS);
  }, []);

  const handleBehaviorChange = useCallback(
    (newBehavior: SidebarBehavior) => {
      applyBehavior(newBehavior);

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
