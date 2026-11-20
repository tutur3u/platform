import type en from './messages/en.json';

type Messages = typeof en;

declare global {
  interface IntlMessages extends Messages {}
  interface ImportMetaEnv {
    readonly VITE_STOREFRONT_NATIVE_PROFILE?: string;
  }
}
