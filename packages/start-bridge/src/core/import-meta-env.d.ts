// The one Vite `import.meta.env` value app-url reads, for retained Next apps
// that compile it without vite/client. The declarations match vite/client's,
// so the two merge in Vite apps; nothing else of Vite becomes global.
interface ImportMetaEnv {
  readonly VITE_TUTURUUU_BASE_PATH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
