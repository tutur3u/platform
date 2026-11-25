/// <reference types="@testing-library/jest-dom/vitest" />

import type en from './messages/en.json';

type Messages = typeof en;

declare global {
  // Use type safe message keys with next-intl
  interface IntlMessages extends Messages {}

  // start-bridge.config.ts reads the build profile; the binding-type check
  // compiles it under tsconfig.json, which does not load Vite's client types.
  interface ImportMetaEnv {
    readonly VITE_WHITEBOARDS_NATIVE_PROFILE?: string;
  }
}
