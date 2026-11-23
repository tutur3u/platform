import { getMeetingPublicInfo } from '@tuturuuu/meet-core/features/call/lib/meeting-public-info';
import { resolveMeetSeoLocale } from '@tuturuuu/meet-core/features/call/lib/seo/copy';
import { buildMeetOgContent } from '@tuturuuu/meet-core/features/call/lib/seo/og-content';
import { renderMeetOgImage } from '@tuturuuu/meet-core/features/call/lib/seo/og-response';
import { connection } from 'next/server';

/**
 * Room link preview. The policy is rechecked on every request: only a room the
 * host made publicly previewable shows its title and time; anything else,
 * including unknown codes, renders the generic card.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string; code: string }> }
) {
  await connection();
  const { locale, code } = await params;
  const lang = resolveMeetSeoLocale(
    new URL(request.url).searchParams.get('lang') ?? locale
  );
  const info = await getMeetingPublicInfo(code);
  return renderMeetOgImage(buildMeetOgContent({ kind: 'room', info }, lang));
}
