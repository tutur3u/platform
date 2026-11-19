import type en from './messages/en.json';

type Messages = typeof en;

declare global {
  interface ImportMetaEnv {
    readonly VITE_FORMS_NATIVE_PROFILE?: string;
  }

  // Use type safe message keys with next-intl
  interface IntlMessages extends Messages {}
}
