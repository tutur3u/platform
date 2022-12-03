import { createContext, useContext, useEffect, useState } from 'react';
import {
  contentWidthPrefs,
  leftSidebarPrefs,
  rightSidebarPrefs,
  themePrefs,
} from '../constants/prefs';
import { Segment } from '../types/primitives/Segment';

type Theme = 'light' | 'dark';
type ContentWidth = 'full' | 'padded';
export type SidebarPreference = 'auto' | 'open' | 'closed' | 'hidden';

const AppearanceContext = createContext({
  theme: 'dark' as Theme,
  changeTheme: (theme: Theme) => console.log('changeTheme', theme),

  leftSidebar: 'auto' as SidebarPreference,
  changeLeftSidebar: (pref: SidebarPreference) =>
    console.log('changeLeftSidebar', pref),

  rightSidebar: 'auto' as SidebarPreference,
  changeRightSidebar: (pref: SidebarPreference) =>
    console.log('changeRightSidebar', pref),

  contentWidth: 'full' as ContentWidth,
  changeContentWidth: (width: ContentWidth) =>
    console.log('changeContentWidth', width),

  segments: [] as Segment[],
  setRootSegment: (segment: Segment | Segment[], conditions?: boolean[]) =>
    console.log(segment, conditions),
  addSegment: (segment: Segment, conditions?: boolean[]) =>
    console.log(segment, conditions),
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

  const changeTheme = (newTheme: Theme) => {
    if (newTheme === theme) return;
    localStorage.setItem(themePrefs, newTheme);
    setTheme(newTheme);
  };

  const changeLeftSidebar = (pref: SidebarPreference) => {
    if (pref === leftSidebar) return;
    localStorage.setItem(leftSidebarPrefs, pref);
    setLeftSidebar(pref);
  };

  const changeRightSidebar = (pref: SidebarPreference) => {
    if (pref === rightSidebar) return;
    localStorage.setItem(rightSidebarPrefs, pref);
    setRightSidebar(pref);
  };

  const changeContentWidth = (width: ContentWidth) => {
    if (width === contentWidth) return;
    localStorage.setItem(contentWidthPrefs, width);
    setContentWidth(width);
  };

  useEffect(() => {
    const theme = localStorage.getItem(themePrefs);
    const leftSidebar = localStorage.getItem(leftSidebarPrefs);
    const rightSidebar = localStorage.getItem(rightSidebarPrefs);
    const contentWidth = localStorage.getItem(contentWidthPrefs);

    if (theme) setTheme(theme as Theme);
    if (leftSidebar) setLeftSidebar(leftSidebar as SidebarPreference);
    if (rightSidebar) setRightSidebar(rightSidebar as SidebarPreference);
    if (contentWidth) setContentWidth(contentWidth as ContentWidth);
  }, []);

  const [segments, setSegments] = useState<Segment[]>([]);

  const setRootSegment = (
    segment: Segment | Segment[],
    conditions?: boolean[]
  ) => {
    // If not all conditions are true, don't set the segment
    if (conditions && conditions.some((condition) => !condition)) return;

    // Update the segments
    setSegments((oldSegments) =>
      Array.isArray(segment)
        ? segment.length > 0
          ? segment
          : oldSegments
        : segment !== null
        ? [segment]
        : oldSegments
    );
  };

  const addSegment = (segment: Segment, conditions?: boolean[]) => {
    // If not all conditions are true, don't add the segment
    if (conditions && conditions.some((condition) => !condition)) return;

    // Update the segments
    setSegments((prev) => [...prev, segment]);
  };

  const values = {
    theme,
    changeTheme,

    leftSidebar,
    changeLeftSidebar,

    rightSidebar,
    changeRightSidebar,

    contentWidth,
    changeContentWidth,

    segments,
    setRootSegment,
    addSegment,
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
