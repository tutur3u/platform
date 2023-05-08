import { createContext, useContext } from 'react';
import {
  APP_THEME_KEY,
  DEFAULT_APP_THEME,
  SIDEBAR_STATE_KEY,
  DEFAULT_SIDEBAR_STATE,
  HIDE_EXPERIMENTAL_KEY,
  DEFAULT_HIDE_EXPERIMENTAL,
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

  hideExperimental: true,
  toggleHideExperimental: () => console.log('toggle'),
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

  const [hideExperimental, setHideExperimental] = useLocalStorage<boolean>({
    key: HIDE_EXPERIMENTAL_KEY,
    defaultValue: DEFAULT_HIDE_EXPERIMENTAL,
  });

  const toggleSidebar = () =>
    setSidebar((prev) => (prev === 'open' ? 'closed' : 'open'));

  const toggleHideExperimental = () => setHideExperimental((prev) => !prev);

  const values = {
    theme,
    setTheme,

    sidebar,
    setSidebar,
    toggleSidebar,

    hideExperimental,
    toggleHideExperimental,
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
