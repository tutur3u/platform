// Bridge Vite values shared with projects that compile without vite/client.
interface ImportMetaEnv {
  readonly VITE_TUTURUUU_BASE_PATH?: string;
  readonly VITE_TUTURUUU_BRIDGE_FAVICON?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
