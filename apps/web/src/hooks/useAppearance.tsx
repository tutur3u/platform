import {
  APP_THEME_KEY,
  DEFAULT_APP_THEME,
  DEFAULT_HIDE_EXPERIMENTAL_ON_SIDEBAR,
  DEFAULT_HIDE_EXPERIMENTAL_ON_TOP_NAVBAR,
  DEFAULT_SIDEBAR_STATE,
  HIDE_EXPERIMENTAL_ON_SIDEBAR_KEY,
  HIDE_EXPERIMENTAL_ON_TOP_NAVBAR_KEY,
  SIDEBAR_STATE_KEY,
} from '@/constants/prefs';
import { useLocalStorage } from '@mantine/hooks';
import React, { createContext, useContext, useEffect } from 'react';

export type Theme = 'light' | 'dark';
export type SidebarState = 'open' | 'closed';

const AppearanceContext = createContext({
  theme: 'dark' as Theme,
  changeTheme: (theme: Theme) => console.log(theme),

  sidebar: 'open' as SidebarState,
  setSidebar: (state: SidebarState) => console.log(state),
  toggleSidebar: () => console.log('toggle'),

  hideExperimentalOnSidebar: true,
  toggleHideExperimentalOnSidebar: () => console.log('toggle'),

  hideExperimentalOnTopNav: true,
  toggleHideExperimentalOnTopNav: () => console.log('toggle'),
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

  useEffect(() => {
    if (
      theme === 'dark' ||
      (!(APP_THEME_KEY in localStorage) &&
        window.matchMedia('(prefers-color-scheme: dark)').matches)
    )
      document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [theme]);

  const changeTheme = (theme: Theme | null) => {
    if (!theme) {
      localStorage.removeItem(APP_THEME_KEY);
      return;
    } else {
      setTheme(theme);
    }
  };

  const [sidebar, setSidebar] = useLocalStorage<SidebarState>({
    key: SIDEBAR_STATE_KEY,
    defaultValue: DEFAULT_SIDEBAR_STATE,
  });

  const [hideExperimentalOnSidebar, setHideExperimentalOnSidebar] =
    useLocalStorage<boolean>({
      key: HIDE_EXPERIMENTAL_ON_SIDEBAR_KEY,
      defaultValue: DEFAULT_HIDE_EXPERIMENTAL_ON_SIDEBAR,
    });

  const [hideExperimentalOnTopNav, setHideExperimentalOnTopNav] =
    useLocalStorage<boolean>({
      key: HIDE_EXPERIMENTAL_ON_TOP_NAVBAR_KEY,
      defaultValue: DEFAULT_HIDE_EXPERIMENTAL_ON_TOP_NAVBAR,
    });

  const toggleSidebar = () =>
    setSidebar((prev) => (prev === 'open' ? 'closed' : 'open'));

  const toggleHideExperimentalOnSidebar = () =>
    setHideExperimentalOnSidebar((prev) => !prev);

  const toggleHideExperimentalOnTopNav = () =>
    setHideExperimentalOnTopNav((prev) => !prev);

  const values = {
    theme,
    changeTheme,

    sidebar,
    setSidebar,
    toggleSidebar,

    hideExperimentalOnSidebar,
    toggleHideExperimentalOnSidebar,

    hideExperimentalOnTopNav,
    toggleHideExperimentalOnTopNav,
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
