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

function createAmbientShapes(
  palette: (typeof ACCENT_PALETTES)[keyof typeof ACCENT_PALETTES]
) {
  return [
    {
      top: '-18%',
      left: '-10%',
      width: 520,
      height: 520,
      background: `radial-gradient(circle, ${palette.secondary}66 0%, transparent 72%)`,
      opacity: 0.82,
    },
    {
      top: '48%',
      left: '52%',
      width: 400,
      height: 400,
      background: `radial-gradient(circle, ${palette.primary}99 0%, transparent 74%)`,
      opacity: 0.72,
    },
    {
      top: '0%',
      left: '72%',
      width: 320,
      height: 320,
      background: `radial-gradient(circle, ${palette.tertiary}40 0%, transparent 74%)`,
      opacity: 0.74,
    },
    {
      top: '68%',
      left: '74%',
      width: 260,
      height: 260,
      background: `radial-gradient(circle, ${palette.secondary}22 0%, transparent 78%)`,
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
  const ambientShapes = createAmbientShapes(palette);
  const previewRows = Array.from({
    length: Math.max(3, Math.min(4, presentation.itemCount || 3)),
  });
  const titleFontSize =
    presentation.title.length > 80
      ? 54
      : presentation.title.length > 54
        ? 62
        : 72;

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
            'linear-gradient(125deg, rgba(255,255,255,0.05) 0%, transparent 26%, transparent 68%, rgba(255,255,255,0.03) 100%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
          backgroundSize: '54px 54px',
          opacity: 0.12,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, rgba(5,8,22,0.06) 0%, rgba(5,8,22,0.18) 100%)',
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
          padding: '44px 48px',
          gap: '48px',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            width: '720px',
            minWidth: '720px',
            paddingTop: '8px',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '30px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px 18px',
                  borderRadius: '999px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  boxShadow: '0 18px 36px rgba(0,0,0,0.18)',
                }}
              >
                <div
                  style={{
                    fontSize: '18px',
                    fontWeight: 700,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: 'rgba(250,250,250,0.92)',
                  }}
                >
                  {strings.brand}
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '26px',
                maxWidth: '680px',
              }}
            >
              <div
                style={{
                  fontSize: `${titleFontSize}px`,
                  lineHeight: 0.94,
                  fontWeight: 800,
                  letterSpacing: '-0.06em',
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
                    width: '100%',
                    maxWidth: '650px',
                    padding: '22px 24px',
                    borderRadius: '28px',
                    background: 'rgba(255,255,255,0.055)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      width: '4px',
                      borderRadius: '999px',
                      marginRight: '18px',
                      background: 'rgba(255,255,255,0.18)',
                    }}
                  />
                  <div
                    style={{
                      display: '-webkit-box',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      WebkitLineClamp: 4,
                      WebkitBoxOrient: 'vertical',
                      fontSize: '24px',
                      lineHeight: 1.4,
                      color: '#d4d4d8',
                    }}
                  >
                    {presentation.description}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: '56px',
              right: '18px',
              width: '316px',
              height: '420px',
              borderRadius: '34px',
              background:
                'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.015) 100%)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 28px 80px rgba(0,0,0,0.22)',
            }}
          />
          <div
            style={{
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              width: '304px',
              height: '404px',
              borderRadius: '30px',
              padding: '20px',
              background: palette.panelBg,
              border: `1px solid ${palette.border}33`,
              boxShadow: '0 24px 72px rgba(0,0,0,0.28)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background:
                  'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 28%, transparent 72%, rgba(255,255,255,0.03) 100%)',
              }}
            />
            <div
              style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                height: '100%',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                  padding: '18px',
                  borderRadius: '24px',
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.04)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                    }}
                  >
                    <div
                      style={{
                        width: '104px',
                        height: '10px',
                        borderRadius: '999px',
                        background: 'rgba(255,255,255,0.9)',
                      }}
                    />
                    <div
                      style={{
                        width: '72px',
                        height: '8px',
                        borderRadius: '999px',
                        background: 'rgba(255,255,255,0.2)',
                      }}
                    />
                  </div>
                  <div
                    style={{
                      width: '46px',
                      height: '46px',
                      borderRadius: '16px',
                      background: `linear-gradient(145deg, ${palette.primary} 0%, ${palette.secondary} 100%)`,
                      boxShadow: `0 12px 28px ${palette.primary}44`,
                    }}
                  />
                </div>
                <div
                  style={{
                    display: 'flex',
                    width: '100%',
                    height: '10px',
                    borderRadius: '999px',
                    background: 'rgba(255,255,255,0.08)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: '62%',
                      height: '100%',
                      borderRadius: '999px',
                      background: 'rgba(255,255,255,0.28)',
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
                  borderRadius: '24px',
                  background: 'rgba(255,255,255,0.045)',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    width: '92px',
                    height: '8px',
                    borderRadius: '999px',
                    background: 'rgba(255,255,255,0.2)',
                  }}
                />
                {previewRows.map((_, index) => (
                  <div
                    key={index}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '14px 14px',
                      borderRadius: '18px',
                      background:
                        index === 1
                          ? `${palette.secondary}14`
                          : 'rgba(255,255,255,0.04)',
                      border:
                        index === 1
                          ? `1px solid ${palette.border}30`
                          : '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <div
                      style={{
                        width: '18px',
                        height: '18px',
                        borderRadius: '999px',
                        border: `2px solid ${index === 1 ? palette.tertiary : 'rgba(255,255,255,0.22)'}`,
                        background:
                          index === 1 ? `${palette.tertiary}22` : 'transparent',
                      }}
                    />
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        flex: 1,
                      }}
                    >
                      <div
                        style={{
                          width:
                            index % 3 === 0
                              ? '72%'
                              : index % 3 === 1
                                ? '88%'
                                : '64%',
                          height: '8px',
                          borderRadius: '999px',
                          background:
                            index === 1
                              ? 'rgba(255,255,255,0.92)'
                              : 'rgba(255,255,255,0.24)',
                        }}
                      />
                      <div
                        style={{
                          width:
                            index % 2 === 0
                              ? '42%'
                              : index === 1
                                ? '52%'
                                : '36%',
                          height: '6px',
                          borderRadius: '999px',
                          background: 'rgba(255,255,255,0.14)',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    size
  );
}
