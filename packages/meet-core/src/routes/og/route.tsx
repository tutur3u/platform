import { buildMeetOgContent } from '@tuturuuu/meet-core/features/call/lib/seo/og-content';
import { renderMeetOgImage } from '@tuturuuu/meet-core/features/call/lib/seo/og-response';
import { resolveMeetSeoLocale } from '@tuturuuu/meet-core/features/call/lib/seo/copy';

/** Link-preview card for the Meet landing and public pages. Static content. */
export function GET(request: Request) {
  const locale = resolveMeetSeoLocale(
    new URL(request.url).searchParams.get('lang') ?? undefined
  );
  return renderMeetOgImage(buildMeetOgContent({ kind: 'landing' }, locale));
}
