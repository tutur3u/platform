import { ProgrammingError } from '@tuturuuu/education-core/education/programming-model';
import { TulearnAccessError } from '@tuturuuu/education-core/tulearn/access';
import { InternalApiError } from '@tuturuuu/internal-api';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';

export async function programmingPageFailure(
  error: unknown,
  locale: string,
  wsId: string
) {
  if (
    error instanceof InternalApiError ||
    error instanceof ProgrammingError ||
    error instanceof TulearnAccessError
  ) {
    if (error.status === 404) notFound();
    if (error.status === 401)
      return redirect({
        locale,
        href: `/login?next=${encodeURIComponent(`/${wsId}/programming`)}`,
      });
    if (error.status === 403 || error.status === 400) {
      const t = await getTranslations('programming');
      return (
        <section role="alert" className="p-6">
          <h1 className="font-semibold text-xl">
            {t(error.status === 400 ? 'invalidRequest' : 'accessDenied')}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {t(
              error.status === 400
                ? 'invalidRequestDescription'
                : 'accessDeniedDescription'
            )}
          </p>
        </section>
      );
    }
  }
  // Server errors never echo private database or judge payload details in RSC.
  throw new Error('Unable to load Programming data');
}
