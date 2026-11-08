import { ImageResponse } from 'next/og';
import { siteConfig } from '@/constants/configs';

export const alt = 'Tuturuuu brand guidelines';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

interface Props {
  params: Promise<{
    locale: string;
  }>;
}

export default async function Image({ params }: Props) {
  const { locale } = await params;
  const isVietnamese = locale === 'vi';
  const title = isVietnamese
    ? 'Bộ nhận diện Tuturuuu'
    : 'Tuturuuu brand guidelines';
  const description = isVietnamese
    ? 'Logo, bảng màu, chữ và quy chuẩn sử dụng'
    : 'Logos, colors, typography, and usage rules';

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        backgroundColor: '#09090B',
        color: '#FFFFFF',
        padding: 56,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'radial-gradient(circle at 18% 18%, rgba(65,128,233,0.24), transparent 34%), radial-gradient(circle at 88% 74%, rgba(251,123,5,0.22), transparent 34%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(0deg, rgba(255,255,255,0.08) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          opacity: 0.28,
        }}
      />

      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: '100%',
          border: '1px solid rgba(255,255,255,0.16)',
          borderRadius: 32,
          padding: 48,
          backgroundColor: 'rgba(9,9,11,0.72)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <img
            alt="Tuturuuu"
            height="86"
            src={`${siteConfig.url}/media/branding/brand-mark-dark.svg`}
            style={{ objectFit: 'contain' }}
            width="398"
          />
          <div
            style={{
              display: 'flex',
              gap: 12,
            }}
          >
            {['#4180E9', '#4ACA3F', '#FB7B05', '#E94646'].map((color) => (
              <div
                key={color}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  backgroundColor: color,
                }}
              />
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 48 }}>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <div
              style={{
                display: 'flex',
                color: '#93C5FD',
                fontSize: 24,
                fontWeight: 600,
                marginBottom: 20,
              }}
            >
              tuturuuu.com/{locale}/branding
            </div>
            <div
              style={{
                display: 'flex',
                fontSize: 76,
                fontWeight: 760,
                lineHeight: 0.95,
                letterSpacing: -2,
                maxWidth: 780,
              }}
            >
              {title}
            </div>
            <div
              style={{
                display: 'flex',
                marginTop: 24,
                color: '#D4D4D8',
                fontSize: 32,
                fontWeight: 500,
              }}
            >
              {description}
            </div>
          </div>

          <div
            style={{
              width: 190,
              height: 190,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 36,
              backgroundColor: '#FFFFFF',
            }}
          >
            <img
              alt="Tuturuuu mark"
              height="132"
              src={`${siteConfig.url}/media/branding/tuturuuu.svg`}
              style={{ objectFit: 'contain' }}
              width="132"
            />
          </div>
        </div>
      </div>
    </div>,
    { ...size }
  );
}
