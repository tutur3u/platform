import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { configs } from '../constants/prefs';
import { Segment } from '../types/primitives/Segment';

type Theme = 'light' | 'dark';

export type MainSidebarPref = 'open' | 'closed';
export type SecondarySidebarPref = 'visible' | 'hidden';

export interface SidebarPreference {
  main: MainSidebarPref;
  secondary: SecondarySidebarPref;
}

const AppearanceContext = createContext({
  theme: 'dark' as Theme,
  changeTheme: (theme: Theme) => console.log(theme),

  leftSidebarPref: { main: 'closed', secondary: 'hidden' } as SidebarPreference,

  changeLeftSidebarPref: (pref: SidebarPreference) => console.log(pref),
  changeLeftSidebarMainPref: (pref: MainSidebarPref) => console.log(pref),
  changeLeftSidebarSecondaryPref: (pref: SecondarySidebarPref) =>
    console.log(pref),

  rightSidebarPref: {
    main: 'closed',
    secondary: 'visible',
  } as SidebarPreference,

  changeRightSidebarPref: (pref: SidebarPreference) => console.log(pref),
  changeRightSidebarMainPref: (pref: MainSidebarPref) => console.log(pref),
  changeRightSidebarSecondaryPref: (pref: SecondarySidebarPref) =>
    console.log(pref),

  segments: [] as Segment[],
  setRootSegment: (segment: Segment | Segment[], conditions?: boolean[]) =>
    console.log(segment, conditions),
  setLastSegment: (segment: Segment) => console.log(segment),
  addSegment: (segment: Segment, conditions?: boolean[]) =>
    console.log(segment, conditions),
});

export const AppearanceProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [theme, setTheme] = useState<Theme>('dark');

  const [leftSidebarPref, setLeftSidebar] = useState<SidebarPreference>({
    main: 'closed',
    secondary: 'visible',
  });

  const [rightSidebarPref, setRightSidebar] = useState<SidebarPreference>({
    main: 'closed',
    secondary: 'hidden',
  });

  const changeTheme = (newTheme: Theme) => {
    // If the theme is the same as the new theme, do nothing
    if (newTheme === theme) return;

    // Otherwise,
    // Save the new theme to local storage
    localStorage.setItem(configs.THEME, newTheme);

    // Update the theme state
    setTheme(newTheme);
  };

  const changeLeftSidebarPref = (pref: SidebarPreference) => {
    // If the preference is the same as the new preference, do nothing
    if (
      pref.main === leftSidebarPref.main &&
      pref.secondary === leftSidebarPref.secondary
    )
      return;

    // Otherwise,
    // Save the new preference to local storage
    localStorage.setItem(configs.LEFT_MAIN_SIDEBAR, pref.main);
    localStorage.setItem(configs.LEFT_SECONDARY_SIDEBAR, pref.secondary);

    // Update the preference state
    setLeftSidebar(pref);
  };

  const changeLeftSidebarMainPref = (pref: MainSidebarPref) => {
    // If the preference is the same as the new preference, do nothing
    if (pref === leftSidebarPref.main) return;

    // Otherwise,
    // Save the new preference to local storage
    localStorage.setItem(configs.LEFT_MAIN_SIDEBAR, pref);

    // Update the preference state
    setLeftSidebar((prev) => ({ ...prev, main: pref }));
  };

  const changeLeftSidebarSecondaryPref = (pref: SecondarySidebarPref) => {
    // If the preference is the same as the new preference, do nothing
    if (pref === leftSidebarPref.secondary) return;

    // Otherwise,
    // Save the new preference to local storage
    localStorage.setItem(configs.LEFT_SECONDARY_SIDEBAR, pref);

    // Update the preference state
    setLeftSidebar((prev) => ({ ...prev, secondary: pref }));
  };

  const changeRightSidebarPref = (pref: SidebarPreference) => {
    // If the preference is the same as the new preference, do nothing
    if (
      pref.main === rightSidebarPref.main &&
      pref.secondary === rightSidebarPref.secondary
    )
      return;

    // Otherwise,
    // Save the new preference to local storage
    localStorage.setItem(configs.RIGHT_MAIN_SIDEBAR, pref.main);
    localStorage.setItem(configs.RIGHT_SECONDARY_SIDEBAR, pref.secondary);

    // Update the preference state
    setRightSidebar(pref);
  };

  const changeRightSidebarMainPref = (pref: MainSidebarPref) => {
    // If the preference is the same as the new preference, do nothing
    if (pref === rightSidebarPref.main) return;

    // Otherwise,
    // Save the new preference to local storage
    localStorage.setItem(configs.RIGHT_MAIN_SIDEBAR, pref);

    // Update the preference state
    setRightSidebar((prev) => ({ ...prev, main: pref }));
  };

  const changeRightSidebarSecondaryPref = (pref: SecondarySidebarPref) => {
    // If the preference is the same as the new preference, do nothing
    if (pref === rightSidebarPref.secondary) return;

    // Otherwise,
    // Save the new preference to local storage
    localStorage.setItem(configs.RIGHT_SECONDARY_SIDEBAR, pref);

    // Update the preference state
    setRightSidebar((prev) => ({ ...prev, secondary: pref }));
  };

  useEffect(() => {
    // Extract the theme from local storage,
    // and update the theme state if it exists
    const theme = localStorage.getItem(configs.THEME) as Theme;
    if (theme) setTheme(theme);

    // Extract the left sidebar preference from local storage,
    // and update the left sidebar preference state if it exists
    const leftMainSidebar = localStorage.getItem(
      configs.LEFT_MAIN_SIDEBAR
    ) as MainSidebarPref;

    const leftSecondarySidebar = localStorage.getItem(
      configs.LEFT_SECONDARY_SIDEBAR
    ) as SecondarySidebarPref;

    if (leftMainSidebar && leftSecondarySidebar) {
      setLeftSidebar({
        main: leftMainSidebar,
        secondary: leftSecondarySidebar,
      });
    }

    // Extract the right sidebar preference from local storage,
    // and update the right sidebar preference state if it exists
    const rightMainSidebar = localStorage.getItem(
      configs.RIGHT_MAIN_SIDEBAR
    ) as MainSidebarPref;

    const rightSecondarySidebar = localStorage.getItem(
      configs.RIGHT_SECONDARY_SIDEBAR
    ) as SecondarySidebarPref;

    if (rightMainSidebar && rightSecondarySidebar) {
      setRightSidebar({
        main: rightMainSidebar,
        secondary: rightSecondarySidebar,
      });
    }
  }, []);

  const [segments, setSegments] = useState<Segment[]>([]);

  const setRootSegment = useCallback(
    (segment: Segment | Segment[], conditions?: boolean[]) => {
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
    },
    []
  );

  const setLastSegment = useCallback((segment: Segment) => {
    // Update the segments
    setSegments((oldSegments) => {
      const newSegments = [...oldSegments];
      newSegments[newSegments.length - 1] = segment;
      return newSegments;
    });
  }, []);

  const addSegment = (segment: Segment, conditions?: boolean[]) => {
    // If not all conditions are true, don't add the segment
    if (conditions && conditions.some((condition) => !condition)) return;

    // Update the segments
    setSegments((prev) => [...prev, segment]);
  };

  const values = {
    theme,
    changeTheme,

    leftSidebarPref,

    changeLeftSidebarPref,
    changeLeftSidebarMainPref,
    changeLeftSidebarSecondaryPref,

    rightSidebarPref,

    changeRightSidebarPref,
    changeRightSidebarMainPref,
    changeRightSidebarSecondaryPref,

    segments,
    setRootSegment,
    setLastSegment,
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
