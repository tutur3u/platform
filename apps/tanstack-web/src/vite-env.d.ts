/// <reference types="vite/client" />

declare module 'moment/locale/vi';

declare module 'cloudflare:workers' {
  import type { BackendServiceBinding } from '@tuturuuu/internal-api';

  export const env: {
    BACKEND?: BackendServiceBinding;
  };
}
