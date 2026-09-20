import { ImageResponse } from 'next/og';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { getMeetingPublicInfo } from '@/features/call/lib/meeting-public-info';

/** Recheck the public-preview policy on every request, including image requests. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string; code: string }> }
) {
  await connection();
  const { locale, code } = await params;
  const requestedLocale =
    new URL(request.url).searchParams.get('lang') ?? locale;
  const t = await getTranslations({
    locale: requestedLocale === 'vi' ? 'vi' : 'en',
    namespace: 'meet.public',
  });
  const info = await getMeetingPublicInfo(code);
  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: '100%',
        height: '100%',
        padding: 64,
        background: '#09090b',
        color: '#fafafa',
        border: '2px solid #27272a',
      }}
    >
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 20, fontSize: 30 }}
      >
        <svg
          width="64"
          height="64"
          viewBox="192 64 384 384"
          role="img"
          aria-label="Tuturuuu"
        >
          <path
            fill="#E94646"
            d="M544 112C544 103.163 536.837 96 528 96C519.163 96 512 103.163 512 112V368C512 376.837 504.837 384 496 384H304C295.163 384 288 391.163 288 400C288 408.837 295.163 416 304 416H512H528C536.837 416 544 408.837 544 400V384V112Z"
          />
          <path
            fill="#FB7B05"
            d="M480 176C480 167.163 472.837 160 464 160C455.163 160 448 167.163 448 176V304C448 312.837 440.837 320 432 320H304C295.163 320 288 327.163 288 336C288 344.837 295.163 352 304 352H448H464C472.837 352 480 344.837 480 336V320V176Z"
          />
          <path
            fill="#4ACA3F"
            d="M416 176C416 167.163 408.837 160 400 160C391.163 160 384 167.163 384 176V240C384 248.837 376.837 256 368 256H304C295.163 256 288 263.163 288 272C288 280.837 295.163 288 304 288H384H400C408.837 288 416 280.837 416 272V256V176Z"
          />
          <path
            fill="#4180E9"
            d="M240 96C231.163 96 224 103.163 224 112C224 120.837 231.163 128 240 128H464C472.837 128 480 120.837 480 112C480 103.163 472.837 96 464 96H240ZM256 176C256 167.163 248.837 160 240 160C231.163 160 224 167.163 224 176V400C224 408.837 231.163 416 240 416C248.837 416 256 408.837 256 400V176Z"
          />
        </svg>
        <span>Tuturuuu Meet</span>
      </div>
      <div
        style={{
          display: 'flex',
          fontSize: 58,
          lineHeight: 1.15,
          fontWeight: 700,
          maxHeight: 280,
          overflow: 'hidden',
        }}
      >
        {info?.title || t('meta_title')}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 24,
          color: '#a1a1aa',
        }}
      >
        <span>
          {info ? t(info.ended ? 'ended' : 'invitation') : t('meta_private')}
        </span>
        <span>meet.tuturuuu.com</span>
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      headers: {
        'Cache-Control': 'private, no-store',
        'X-Robots-Tag': 'noindex',
      },
    }
  );
}
