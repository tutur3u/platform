// The workspace app only reads external-project bindings. Bearer, app-session
// and token-exchange authorization for external projects lives in apps/web.
export { resolveWorkspaceExternalProjectBinding } from './binding-state';
