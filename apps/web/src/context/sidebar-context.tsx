'use client';

import { setCookie } from 'cookies-next';
import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useContext,
  useState,
} from 'react';
import { SIDEBAR_BEHAVIOR_COOKIE_NAME } from '@/constants/common';

type SidebarBehavior = 'expanded' | 'collapsed' | 'hover';

interface SidebarContextProps {
  behavior: SidebarBehavior;
  setBehavior: Dispatch<SetStateAction<SidebarBehavior>>;
  handleBehaviorChange: (newBehavior: SidebarBehavior) => void;
}

export const SidebarContext = createContext<SidebarContextProps | undefined>(
  undefined
);

export const SidebarProvider = ({
  children,
  initialBehavior,
}: {
  children: ReactNode;
  initialBehavior: SidebarBehavior;
}) => {
  const [behavior, setBehavior] = useState<SidebarBehavior>(initialBehavior);

  const handleBehaviorChange = (newBehavior: SidebarBehavior) => {
    setBehavior(newBehavior);
    setCookie(SIDEBAR_BEHAVIOR_COOKIE_NAME, newBehavior);
  };

  return (
    <SidebarContext.Provider
      value={{ behavior, setBehavior, handleBehaviorChange }}
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
