import { createContext, useContext } from 'react';
import {
  APP_THEME_KEY,
  DEFAULT_APP_THEME,
  SIDEBAR_STATE_KEY,
  DEFAULT_SIDEBAR_STATE,
} from '../constants/prefs';
import { useLocalStorage } from '@mantine/hooks';

export type Theme = 'light' | 'dark';
export type SidebarState = 'open' | 'closed';

const AppearanceContext = createContext({
  theme: 'dark' as Theme,
  setTheme: (theme: Theme) => console.log(theme),

  sidebar: 'open' as SidebarState,
  setSidebar: (state: SidebarState) => console.log(state),
  toggleSidebar: () => console.log('toggle'),
});

export const AppearanceProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [theme, setTheme] = useLocalStorage<Theme>({
    key: APP_THEME_KEY,
    defaultValue: DEFAULT_APP_THEME,
  });

  const [sidebar, setSidebar] = useLocalStorage<SidebarState>({
    key: SIDEBAR_STATE_KEY,
    defaultValue: DEFAULT_SIDEBAR_STATE,
  });

  const toggleSidebar = () =>
    setSidebar((prev) => (prev === 'open' ? 'closed' : 'open'));

  const values = {
    theme,
    setTheme,

    sidebar,
    setSidebar,
    toggleSidebar,
  };

  return (
    <AppearanceContext.Provider value={values}>
      {children}
    </AppearanceContext.Provider>
  );
};

export const useAppearance = () => {
  const context = useContext(AppearanceContext);

  if (context === undefined)
    throw new Error(
      `useAppearance() must be used within a AppearanceProvider.`
    );

  return context;
};
