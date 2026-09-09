import { ColabRequestError } from '@tuturuuu/internal-api/colab';
import { Alert, AlertDescription } from '@tuturuuu/ui/alert';
import { useCopy } from './i18n';

export function ErrorNotice({ error }: { error: unknown }) {
  const c = useCopy();
  const code = error instanceof Error ? error.message : '';
  const friendly = c.errors[code as keyof typeof c.errors];
  return error ? (
    <Alert variant="destructive">
      <AlertDescription>
        {friendly ?? c.error}
        {error instanceof ColabRequestError &&
          error.status === 401 &&
          ` ${c.authHelp}`}
        {error instanceof Error && (
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer">{c.errorDetails}</summary>
            <code className="mt-1 block">{error.message}</code>
          </details>
        )}
      </AlertDescription>
    </Alert>
  ) : null;
}
