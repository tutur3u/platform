import { createContext, useContext } from 'react';
import { useToggle } from '@mantine/hooks';
import ContextProps from '../types/ContextProps';

//* Create a context for the sidebar
// Then populate the default value with the
// sidebar state and necessary functions
const SidebarContext = createContext({
  isCollapsed: false,
  collapse: () => {
    return;
  },
  expand: () => {
    return;
  },
  toggle: () => {
    return;
  },
});

//* Create a provider for the sidebar
export function SidebarProvider({ children }: ContextProps) {
  //* Sidebar state
  // By default sidebar is expanded
  const [isCollapsed, toggleSidebar] = useToggle([false, true]);

  function collapse() {
    // Only collapse sidebar if it is not collapsed already
    if (!isCollapsed) toggleSidebar();
  }

  function expand() {
    // Only expand sidebar if it is collapsed
    if (isCollapsed) toggleSidebar();
  }

  //* This separate function is created to avoid passing any arguments
  //* to toggleSidebar, which might cause unexpected behavior
  //? If sidebar is collapsed, expand it
  //? Otherwise, collapse it
  const toggle = () => (isCollapsed ? expand() : collapse());

  const values = {
    isCollapsed,
    collapse,
    expand,
    toggle,
  };

  return (
    <SidebarContext.Provider value={values}>{children}</SidebarContext.Provider>
  );
}

export const useSidebar = () => {
  // Get the current context
  const context = useContext(SidebarContext);

  // Throw an error if context is not provided
  //? This will happen if the component is not wrapped in SidebarProvider
  if (context === undefined)
    throw new Error('useSidebar() must be used within a SidebarProvider.');

  return context;
};
