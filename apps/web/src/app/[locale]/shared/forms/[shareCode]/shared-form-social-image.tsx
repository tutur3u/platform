import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import type { FormDefinition } from '@/features/forms/types';
import type { SharedFormMetadataStrings } from './shared-form-data';
import { getSharedFormPresentation } from './shared-form-data';

const ACCENT_PALETTES: Record<
  FormDefinition['theme']['accentColor'],
  {
    primary: string;
    secondary: string;
    tertiary: string;
    border: string;
    badgeBg: string;
    badgeText: string;
    panelBg: string;
  }
> = {
  'dynamic-blue': {
    primary: '#0f4c81',
    secondary: '#3b82f6',
    tertiary: '#7dd3fc',
    border: '#7dd3fc',
    badgeBg: 'rgba(15, 76, 129, 0.28)',
    badgeText: '#bfdbfe',
    panelBg: 'rgba(8, 23, 44, 0.9)',
  },
  'dynamic-cyan': {
    primary: '#155e75',
    secondary: '#06b6d4',
    tertiary: '#67e8f9',
    border: '#67e8f9',
    badgeBg: 'rgba(21, 94, 117, 0.28)',
    badgeText: '#a5f3fc',
    panelBg: 'rgba(6, 28, 37, 0.9)',
  },
  'dynamic-gray': {
    primary: '#27272a',
    secondary: '#71717a',
    tertiary: '#d4d4d8',
    border: '#d4d4d8',
    badgeBg: 'rgba(82, 82, 91, 0.32)',
    badgeText: '#f4f4f5',
    panelBg: 'rgba(24, 24, 27, 0.9)',
  },
  'dynamic-green': {
    primary: '#14532d',
    secondary: '#22c55e',
    tertiary: '#86efac',
    border: '#86efac',
    badgeBg: 'rgba(20, 83, 45, 0.28)',
    badgeText: '#bbf7d0',
    panelBg: 'rgba(8, 30, 18, 0.9)',
  },
  'dynamic-indigo': {
    primary: '#312e81',
    secondary: '#6366f1',
    tertiary: '#a5b4fc',
    border: '#a5b4fc',
    badgeBg: 'rgba(49, 46, 129, 0.28)',
    badgeText: '#c7d2fe',
    panelBg: 'rgba(18, 19, 54, 0.9)',
  },
  'dynamic-orange': {
    primary: '#9a3412',
    secondary: '#f97316',
    tertiary: '#fdba74',
    border: '#fdba74',
    badgeBg: 'rgba(154, 52, 18, 0.28)',
    badgeText: '#fed7aa',
    panelBg: 'rgba(47, 19, 8, 0.9)',
  },
  'dynamic-pink': {
    primary: '#9d174d',
    secondary: '#ec4899',
    tertiary: '#f9a8d4',
    border: '#f9a8d4',
    badgeBg: 'rgba(157, 23, 77, 0.28)',
    badgeText: '#fbcfe8',
    panelBg: 'rgba(49, 10, 29, 0.9)',
  },
  'dynamic-purple': {
    primary: '#6b21a8',
    secondary: '#a855f7',
    tertiary: '#d8b4fe',
    border: '#d8b4fe',
    badgeBg: 'rgba(107, 33, 168, 0.28)',
    badgeText: '#f3e8ff',
    panelBg: 'rgba(37, 10, 55, 0.9)',
  },
  'dynamic-red': {
    primary: '#991b1b',
    secondary: '#ef4444',
    tertiary: '#fca5a5',
    border: '#fca5a5',
    badgeBg: 'rgba(153, 27, 27, 0.28)',
    badgeText: '#fecaca',
    panelBg: 'rgba(50, 12, 12, 0.9)',
  },
  'dynamic-yellow': {
    primary: '#854d0e',
    secondary: '#eab308',
    tertiary: '#fde047',
    border: '#fde047',
    badgeBg: 'rgba(133, 77, 14, 0.28)',
    badgeText: '#fef08a',
    panelBg: 'rgba(48, 30, 7, 0.9)',
  },
};

let logoDataUrlPromise: Promise<string> | null = null;

async function getLogoDataUrl() {
  if (!logoDataUrlPromise) {
    const candidatePaths = [
      path.join(process.cwd(), 'public/media/logos/transparent.png'),
      path.join(process.cwd(), 'apps/web/public/media/logos/transparent.png'),
    ];

    logoDataUrlPromise = (async () => {
      for (const candidatePath of candidatePaths) {
        try {
          const buffer = await readFile(candidatePath);
          return `data:image/png;base64,${buffer.toString('base64')}`;
        } catch (error) {
          if (
            !(
              error &&
              typeof error === 'object' &&
              'code' in error &&
              error.code === 'ENOENT'
            )
          ) {
            throw error;
          }
        }
      }

      throw new Error('Unable to locate OG logo asset.');
    })();
  }

  return logoDataUrlPromise;
}

function createAmbientShapes(
  palette: (typeof ACCENT_PALETTES)[keyof typeof ACCENT_PALETTES]
) {
  return [
    {
      top: '-12%',
      left: '-4%',
      width: 420,
      height: 420,
      background: `radial-gradient(circle, ${palette.secondary}66 0%, transparent 72%)`,
      opacity: 0.9,
    },
    {
      top: '44%',
      left: '56%',
      width: 360,
      height: 360,
      background: `radial-gradient(circle, ${palette.primary}99 0%, transparent 74%)`,
      opacity: 0.85,
    },
    {
      top: '4%',
      left: '70%',
      width: 260,
      height: 260,
      background: `radial-gradient(circle, ${palette.tertiary}40 0%, transparent 74%)`,
      opacity: 0.9,
    },
  ];
}

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

export async function createSharedFormSocialImage({
  form,
  strings,
  status = 200,
}: {
  form: FormDefinition | null | undefined;
  strings: SharedFormMetadataStrings;
  status?: number;
}) {
  const presentation = getSharedFormPresentation(form, strings, status);
  const palette = ACCENT_PALETTES[presentation.accentColor];
  const logoUrl = await getLogoDataUrl();
  const ambientShapes = createAmbientShapes(palette);

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        position: 'relative',
        overflow: 'hidden',
        background:
          'linear-gradient(135deg, #050816 0%, #09090b 42%, #111827 100%)',
        color: '#fafafa',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(115deg, rgba(255,255,255,0.04) 0%, transparent 28%, transparent 72%, rgba(255,255,255,0.03) 100%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          opacity: 0.22,
        }}
      />
      {ambientShapes.map((shape, index) => (
        <div
          key={index}
          style={{
            position: 'absolute',
            borderRadius: '999px',
            filter: 'blur(26px)',
            ...shape,
          }}
        />
      ))}

      <div
        style={{
          position: 'relative',
          display: 'flex',
          width: '100%',
          height: '100%',
          padding: '52px 56px',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '72px',
            right: '68px',
            width: '300px',
            height: '460px',
            borderRadius: '44px',
            border: '1px solid rgba(255,255,255,0.08)',
            background:
              'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.22)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '96px',
            right: '92px',
            width: '252px',
            height: '412px',
            borderRadius: '36px',
            border: `1px solid ${palette.border}33`,
            background:
              'linear-gradient(165deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.01) 100%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '126px',
            right: '120px',
            width: '196px',
            height: '352px',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              padding: '20px',
              borderRadius: '24px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <div
              style={{
                width: '96px',
                height: '10px',
                borderRadius: '999px',
                background: 'rgba(255,255,255,0.9)',
              }}
            />
            <div
              style={{
                width: '132px',
                height: '8px',
                borderRadius: '999px',
                background: 'rgba(255,255,255,0.16)',
              }}
            />
            <div
              style={{
                display: 'flex',
                marginTop: '4px',
                width: '100%',
                height: '12px',
                borderRadius: '999px',
                background: 'rgba(255,255,255,0.08)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: '58%',
                  height: '100%',
                  borderRadius: '999px',
                  background: `linear-gradient(90deg, ${palette.primary} 0%, ${palette.secondary} 100%)`,
                }}
              />
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              padding: '18px',
              borderRadius: '22px',
              background: 'rgba(255,255,255,0.035)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <div
              style={{
                width: '86px',
                height: '8px',
                borderRadius: '999px',
                background: 'rgba(255,255,255,0.2)',
              }}
            />
            <div
              style={{
                width: '100%',
                height: '44px',
                borderRadius: '16px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            />
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              padding: '18px',
              borderRadius: '22px',
              background: `${palette.secondary}12`,
              border: `1px solid ${palette.border}44`,
            }}
          >
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '999px',
                    border: `2px solid ${index === 1 ? palette.tertiary : 'rgba(255,255,255,0.24)'}`,
                    background:
                      index === 1 ? `${palette.tertiary}22` : 'transparent',
                  }}
                />
                <div
                  style={{
                    width:
                      index === 0 ? '88px' : index === 1 ? '120px' : '96px',
                    height: '8px',
                    borderRadius: '999px',
                    background:
                      index === 1
                        ? 'rgba(255,255,255,0.88)'
                        : 'rgba(255,255,255,0.18)',
                  }}
                />
              </div>
            ))}
          </div>
          <div
            style={{
              marginTop: 'auto',
              width: '100%',
              height: '46px',
              borderRadius: '16px',
              background: `linear-gradient(135deg, ${palette.primary} 0%, ${palette.secondary} 100%)`,
              boxShadow: `0 12px 28px ${palette.primary}55`,
            }}
          />
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            width: '100%',
            minWidth: '100%',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '40px',
              width: '760px',
              marginTop: '8px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
              }}
            >
              {/* biome-ignore lint/performance/noImgElement: ImageResponse requires standard img elements. */}
              <img
                src={logoUrl}
                alt=""
                style={{
                  width: '54px',
                  height: '54px',
                  objectFit: 'contain',
                }}
              />
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '28px',
              }}
            >
              <div
                style={{
                  fontSize: presentation.title.length > 68 ? '56px' : '68px',
                  lineHeight: 0.98,
                  fontWeight: 700,
                  letterSpacing: '-0.055em',
                  display: '-webkit-box',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                }}
              >
                {presentation.title}
              </div>
              {presentation.description ? (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    padding: '22px 24px',
                    maxWidth: '700px',
                    borderRadius: '28px',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    boxShadow: '0 18px 44px rgba(0,0,0,0.16)',
                  }}
                >
                  <div
                    style={{
                      fontSize: '24px',
                      lineHeight: 1.42,
                      color: '#d4d4d8',
                      display: '-webkit-box',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      WebkitLineClamp: 4,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {presentation.description}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '18px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <div
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '999px',
                  background: palette.secondary,
                  boxShadow: `0 0 24px ${palette.secondary}`,
                }}
              />
              <div
                style={{
                  display: 'flex',
                  width: '84px',
                  height: '2px',
                  background: 'rgba(255,255,255,0.12)',
                }}
              />
            </div>
            <div
              style={{
                display: 'flex',
                width: '220px',
                height: '2px',
                background: 'rgba(255,255,255,0.08)',
              }}
            />
          </div>
        </div>
      </div>
    </div>,
    size
  );
}
