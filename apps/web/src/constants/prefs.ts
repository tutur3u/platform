import { SidebarState, Theme } from '@/hooks/useAppearance';

export const APP_THEME_KEY = 'APP_THEME';
export const DEFAULT_APP_THEME: Theme = 'dark';

export const APP_LOCALE_KEY = 'APP_LOCALE';
export const DEFAULT_APP_LOCALE = 'en';

export const SIDEBAR_STATE_KEY = 'SIDEBAR_STATE';
export const DEFAULT_SIDEBAR_STATE: SidebarState = 'closed';

export const HIDE_EXPERIMENTAL_ON_SIDEBAR_KEY = 'HIDE_EXPERIMENTAL';
export const DEFAULT_HIDE_EXPERIMENTAL_ON_SIDEBAR = true;

export const HIDE_EXPERIMENTAL_ON_TOP_NAVBAR_KEY =
  'HIDE_EXPERIMENTAL_ON_TOP_NAVBAR';
export const DEFAULT_HIDE_EXPERIMENTAL_ON_TOP_NAVBAR = true;
