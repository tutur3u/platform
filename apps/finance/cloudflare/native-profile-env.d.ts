// Build-time profile selector; merges with vite/client's ImportMetaEnv and
// keeps compiling where only the bridge's narrow declaration is present.
interface ImportMetaEnv {
  readonly VITE_FINANCE_NATIVE_PROFILE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
