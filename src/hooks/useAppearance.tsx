import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

const AppearanceContext = createContext({
  theme: 'dark',
  setTheme: null as ((theme: Theme) => void) | null,

  darkmode: true,
  enableDarkmode: null as (() => void) | null,
  enableLightmode: null as (() => void) | null,

  fullWidth: false,
  enableFullWidth: null as (() => void) | null,
  enablePaddedWidth: null as (() => void) | null,
});

export const AppearanceProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [theme, setTheme] = useState<Theme>('dark');
  const [fullWidth, setFullWidth] = useState<boolean>(false);

  const darkmode = theme === 'dark';

  const enableLightmode = () => {
    const theme = 'light';
    localStorage.setItem('theme', theme);
    setTheme(theme);
  };
  const enableDarkmode = () => {
    const theme = 'dark';
    localStorage.setItem('theme', theme);
    setTheme(theme);
  };

  const enableFullWidth = () => {
    localStorage.setItem('fullWidth', 'true');
    setFullWidth(true);
  };
  const enablePaddedWidth = () => {
    localStorage.setItem('fullWidth', 'false');
    setFullWidth(false);
  };

  useEffect(() => {
    const theme = localStorage.getItem('theme');
    const fullWidth = localStorage.getItem('fullWidth');

    if (theme) setTheme(theme as Theme);
    else setTheme('dark');

    if (fullWidth) setFullWidth(fullWidth === 'true');
    else setFullWidth(false);
  }, []);

  const values = {
    theme,
    setTheme,

    darkmode,
    enableDarkmode,
    enableLightmode,

    fullWidth,
    enableFullWidth,
    enablePaddedWidth,
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
