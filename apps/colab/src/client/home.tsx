import { useCopy } from './i18n';

export function ErrorNotice({ error }: { error: unknown }) {
  const c = useCopy();
  return error ? (
    <p className="error" role="alert">
      {c.error} <code>{error instanceof Error ? error.message : ''}</code>{' '}
      {c.authHelp}
    </p>
  ) : null;
}
