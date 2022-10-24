import { createContext, useContext, useEffect, useState } from 'react';
import {
  contentWidthPrefs,
  leftSidebarPrefs,
  rightSidebarPrefs,
  themePrefs,
} from '../constants/prefs';

type Theme = 'light' | 'dark';
type ContentWidth = 'full' | 'padded';
export type SidebarPreference = 'auto' | 'open' | 'closed';

const AppearanceContext = createContext({
  theme: 'dark' as Theme,
  changeTheme: (theme: Theme) => localStorage.setItem(themePrefs, theme),

  leftSidebar: 'auto' as SidebarPreference,
  changeLeftSidebar: (pref: SidebarPreference) =>
    localStorage.setItem(leftSidebarPrefs, pref),

  rightSidebar: 'auto' as SidebarPreference,
  changeRightSidebar: (pref: SidebarPreference) =>
    localStorage.setItem(rightSidebarPrefs, pref),

  contentWidth: 'full' as ContentWidth,
  changeContentWidth: (width: ContentWidth) =>
    localStorage.setItem(contentWidthPrefs, width),
});

export const AppearanceProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [theme, setTheme] = useState<Theme>('dark');
  const [leftSidebar, setLeftSidebar] = useState<SidebarPreference>('closed');
  const [rightSidebar, setRightSidebar] = useState<SidebarPreference>('closed');
  const [contentWidth, setContentWidth] = useState<ContentWidth>('full');

  const changeTheme = (theme: Theme) => {
    localStorage.setItem(themePrefs, theme);
    setTheme(theme);
  };

  const changeLeftSidebar = (pref: SidebarPreference) => {
    localStorage.setItem(leftSidebarPrefs, pref);
    setLeftSidebar(pref);
  };

  const changeRightSidebar = (pref: SidebarPreference) => {
    localStorage.setItem(rightSidebarPrefs, pref);
    setRightSidebar(pref);
  };

  const changeContentWidth = (width: ContentWidth) => {
    localStorage.setItem(contentWidthPrefs, width);
    setContentWidth(width);
  };

  useEffect(() => {
    const theme = localStorage.getItem(themePrefs);
    const leftSidebar = localStorage.getItem(leftSidebarPrefs);
    const rightSidebar = localStorage.getItem(rightSidebarPrefs);
    const contentWidth = localStorage.getItem(contentWidthPrefs);

    if (theme) changeTheme(theme as Theme);
    if (leftSidebar) changeLeftSidebar(leftSidebar as SidebarPreference);
    if (rightSidebar) changeRightSidebar(rightSidebar as SidebarPreference);
    if (contentWidth) changeContentWidth(contentWidth as ContentWidth);
  }, []);

  const values = {
    theme,
    changeTheme,

    leftSidebar,
    changeLeftSidebar,

    rightSidebar,
    changeRightSidebar,

    contentWidth,
    changeContentWidth,
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
