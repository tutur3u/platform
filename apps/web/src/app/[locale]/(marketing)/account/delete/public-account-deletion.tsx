import { LogIn } from '@tuturuuu/icons/lucide';
import { Button } from '@tuturuuu/ui/button';
import {
  TUTURUUU_LOCAL_LOGO_URL,
  TuturuuLogo,
} from '@tuturuuu/ui/custom/tuturuuu-logo';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

/** Fixed return target; nothing from the request URL is reflected here. */
export const ACCOUNT_DELETE_LOGIN_HREF = '/login?nextUrl=/account/delete';

const STEP_KEYS = [
  'step-sign-in',
  'step-subscriptions',
  'step-confirm',
] as const;
const DELETED_KEYS = [
  'deleted-sign-in',
  'deleted-memberships',
  'deleted-workspaces',
] as const;
const KEPT_KEYS = [
  'kept-profile',
  'kept-shared-content',
  'kept-backups',
  'kept-billing',
  'kept-security-logs',
  'kept-ai-metadata',
] as const;

export default async function PublicAccountDeletion() {
  const t = await getTranslations('account-deletion-public');

  type MessageKey = Parameters<typeof t>[0];
  const section = (
    titleKey: MessageKey,
    keys: readonly MessageKey[],
    ordered = false
  ) => {
    const List = ordered ? 'ol' : 'ul';
    return (
      <section className="space-y-2">
        <h2 className="font-semibold text-base">{t(titleKey)}</h2>
        <List
          className={`space-y-1.5 pl-5 text-muted-foreground text-sm ${
            ordered ? 'list-decimal' : 'list-disc'
          }`}
        >
          {keys.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </List>
      </section>
    );
  };

  return (
    <main className="flex min-h-screen w-full justify-center bg-background px-4 py-12">
      <div className="w-full max-w-xl space-y-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <TuturuuLogo src={TUTURUUU_LOCAL_LOGO_URL} width={64} height={64} />
          <h1 className="font-semibold text-2xl">{t('title')}</h1>
          <p className="text-muted-foreground text-sm">{t('description')}</p>
        </div>

        <div className="space-y-6 rounded-xl border border-border bg-card p-6 text-card-foreground">
          {section('steps-title', STEP_KEYS, true)}
          {section('deleted-title', DELETED_KEYS)}
          {section('kept-title', KEPT_KEYS)}
        </div>

        <div className="flex flex-col items-center gap-3 text-center">
          <Button asChild className="w-full sm:w-auto">
            <Link href={ACCOUNT_DELETE_LOGIN_HREF}>
              <LogIn className="mr-2 h-4 w-4" />
              {t('sign-in')}
            </Link>
          </Button>
          <p className="text-muted-foreground text-sm">
            {t.rich('cannot-sign-in', {
              email: (chunks) => (
                <a
                  className="font-medium text-foreground underline"
                  href="mailto:privacy@tuturuuu.com"
                >
                  {chunks}
                </a>
              ),
              policy: (chunks) => (
                <Link
                  className="font-medium text-foreground underline"
                  href="/privacy"
                >
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </div>
      </div>
    </main>
  );
}
