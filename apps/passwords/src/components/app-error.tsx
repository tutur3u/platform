import { Button } from '@tuturuuu/ui/button';
import { useI18n } from '../i18n/provider';
import {
  PASSWORDS_ERROR_CODES,
  type PasswordsErrorCode,
} from '../service/port';

/** The code is the error message, so it survives serialization from a loader. */
function codeOf(error: unknown): PasswordsErrorCode {
  const message = error instanceof Error ? error.message : '';
  return (
    PASSWORDS_ERROR_CODES.find((code) => code === message) ?? 'UNAVAILABLE'
  );
}

/** Renders a stable code message; never the thrown error's own text. */
export function AppError({ error, reset }: { error: unknown; reset(): void }) {
  const { t } = useI18n();
  const code = codeOf(error);
  return (
    <main className="mx-auto grid max-w-md gap-4 px-4 py-24 text-center">
      <p role="alert">{t(`errors.${code}`)}</p>
      <Button className="justify-self-center" onClick={reset}>
        {t('common.retry')}
      </Button>
    </main>
  );
}
