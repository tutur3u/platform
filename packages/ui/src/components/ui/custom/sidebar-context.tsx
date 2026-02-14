'use client';

import { useLocalStorage } from '@tuturuuu/ui/hooks/use-local-storage';
import {
  useUpdateUserConfig,
  useUserConfig,
} from '@tuturuuu/ui/hooks/use-user-config';
import { setCookie } from 'cookies-next';
import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

export const SIDEBAR_BEHAVIOR_COOKIE_NAME = 'sidebar-behavior';
export const SIDEBAR_BEHAVIOR_CONFIG_KEY = 'SIDEBAR_BEHAVIOR';

export type SidebarBehavior = 'expanded' | 'collapsed' | 'hover';

const isValidBehavior = (value: string | undefined): value is SidebarBehavior =>
  value === 'expanded' || value === 'collapsed' || value === 'hover';

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
  const hasAppliedRemote = useRef(false);
  // Prevents remote sync from overwriting a user-initiated change
  const userChangedRef = useRef(false);
  // Allows reading current behavior inside the sync effect without
  // adding `behavior` to its dependency array
  const behaviorRef = useRef(behavior);
  behaviorRef.current = behavior;

  // Fetch account-wide preference
  const { data: remoteBehavior, isSuccess: remoteLoaded } = useUserConfig(
    SIDEBAR_BEHAVIOR_CONFIG_KEY,
    'expanded'
  );

  const updateConfig = useUpdateUserConfig();

  // Sync from user_configs when not locally overridden
  useEffect(() => {
    if (
      !remoteLoaded ||
      localOverride ||
      hasAppliedRemote.current ||
      userChangedRef.current
    )
      return;
    hasAppliedRemote.current = true;
    if (
      isValidBehavior(remoteBehavior) &&
      remoteBehavior !== behaviorRef.current
    ) {
      setBehavior(remoteBehavior);
      setCookie(SIDEBAR_BEHAVIOR_COOKIE_NAME, remoteBehavior, COOKIE_OPTIONS);
    }
  }, [remoteLoaded, remoteBehavior, localOverride]);

  const handleBehaviorChange = useCallback(
    (newBehavior: SidebarBehavior) => {
      userChangedRef.current = true;
      setBehavior(newBehavior);
      // Always update cookie for SSR
      setCookie(SIDEBAR_BEHAVIOR_COOKIE_NAME, newBehavior, COOKIE_OPTIONS);
      // Save to user_configs (account-wide) unless locally overridden
      if (!localOverride) {
        updateConfig.mutate({
          configId: SIDEBAR_BEHAVIOR_CONFIG_KEY,
          value: newBehavior,
        });
      }
    },
    [localOverride, updateConfig]
  );

  const setLocalOverride = useCallback(
    (enabled: boolean) => {
      setLocalOverrideRaw(enabled);
      if (!enabled && isValidBehavior(remoteBehavior)) {
        // Turning off local override — sync to account-wide value
        setBehavior(remoteBehavior);
        setCookie(SIDEBAR_BEHAVIOR_COOKIE_NAME, remoteBehavior, COOKIE_OPTIONS);
      } else if (enabled) {
        // Turning on local override — save current behavior to account-wide first
        updateConfig.mutate({
          configId: SIDEBAR_BEHAVIOR_CONFIG_KEY,
          value: behavior,
        });
      }
    },
    [setLocalOverrideRaw, remoteBehavior, behavior, updateConfig]
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
