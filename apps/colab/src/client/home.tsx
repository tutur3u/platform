import { ColabRequestError } from '@tuturuuu/internal-api/colab';
import { Alert, AlertDescription } from '@tuturuuu/ui/alert';
import { useCopy } from './i18n';

export function ErrorNotice({ error }: { error: unknown }) {
  const c = useCopy();
  return error ? (
    <Alert variant="destructive">
      <AlertDescription>
        {c.error}
        {error instanceof ColabRequestError &&
          error.status === 401 &&
          ` ${c.authHelp}`}
        {error instanceof Error && (
          <code className="mt-1 block text-xs">{error.message}</code>
        )}
      </AlertDescription>
    </Alert>
  ) : null;
}
