import { ImageResponse } from 'next/og';
import { siteConfig } from '@/constants/configs';
import type { FormDefinition } from '@/features/forms/types';
import type { SharedFormMetadataStrings } from './shared-form-data';
import { getSharedFormPresentation } from './shared-form-data';

const ACCENT_PALETTES: Record<
  FormDefinition['theme']['accentColor'],
  {
    primary: string;
    secondary: string;
    border: string;
    badgeBg: string;
    badgeText: string;
  }
> = {
  'dynamic-blue': {
    primary: '#0f4c81',
    secondary: '#3b82f6',
    border: '#7dd3fc',
    badgeBg: '#0f4c8133',
    badgeText: '#93c5fd',
  },
  'dynamic-cyan': {
    primary: '#155e75',
    secondary: '#06b6d4',
    border: '#67e8f9',
    badgeBg: '#155e7533',
    badgeText: '#67e8f9',
  },
  'dynamic-gray': {
    primary: '#27272a',
    secondary: '#71717a',
    border: '#d4d4d8',
    badgeBg: '#3f3f4633',
    badgeText: '#e4e4e7',
  },
  'dynamic-green': {
    primary: '#14532d',
    secondary: '#22c55e',
    border: '#86efac',
    badgeBg: '#14532d33',
    badgeText: '#86efac',
  },
  'dynamic-indigo': {
    primary: '#312e81',
    secondary: '#6366f1',
    border: '#a5b4fc',
    badgeBg: '#312e8133',
    badgeText: '#c7d2fe',
  },
  'dynamic-orange': {
    primary: '#9a3412',
    secondary: '#f97316',
    border: '#fdba74',
    badgeBg: '#9a341233',
    badgeText: '#fdba74',
  },
  'dynamic-pink': {
    primary: '#9d174d',
    secondary: '#ec4899',
    border: '#f9a8d4',
    badgeBg: '#9d174d33',
    badgeText: '#fbcfe8',
  },
  'dynamic-purple': {
    primary: '#6b21a8',
    secondary: '#a855f7',
    border: '#d8b4fe',
    badgeBg: '#6b21a833',
    badgeText: '#e9d5ff',
  },
  'dynamic-red': {
    primary: '#991b1b',
    secondary: '#ef4444',
    border: '#fca5a5',
    badgeBg: '#991b1b33',
    badgeText: '#fecaca',
  },
  'dynamic-yellow': {
    primary: '#854d0e',
    secondary: '#eab308',
    border: '#fde047',
    badgeBg: '#854d0e33',
    badgeText: '#fde68a',
  },
};

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

export function createSharedFormSocialImage({
  form,
  strings,
  status = 200,
  coverImageUrl,
}: {
  form: FormDefinition | null | undefined;
  strings: SharedFormMetadataStrings;
  status?: number;
  coverImageUrl?: string;
}) {
  const presentation = getSharedFormPresentation(form, strings, status);
  const palette = ACCENT_PALETTES[presentation.accentColor];
  const resolvedCoverImageUrl = coverImageUrl || presentation.coverImageUrl;
  const logoUrl = `${siteConfig.url}/media/logos/transparent.png`;

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: '#09090b',
        color: '#fafafa',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(135deg, ${palette.primary}f0 0%, rgba(9,9,11,0.96) 46%, rgba(9,9,11,1) 100%)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(circle at top right, ${palette.secondary}55 0%, transparent 34%), radial-gradient(circle at bottom left, ${palette.primary}55 0%, transparent 36%)`,
        }}
      />
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: '100%',
          height: '100%',
          padding: '56px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '24px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
            }}
          >
            {/* biome-ignore lint/performance/noImgElement: ImageResponse requires standard img elements for generated OG images. */}
            <img
              src={logoUrl}
              alt=""
              style={{
                width: '54px',
                height: '54px',
                objectFit: 'contain',
              }}
            />
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <span
                style={{
                  fontSize: '28px',
                  fontWeight: 700,
                  color: '#f4f4f5',
                }}
              >
                Forms
              </span>
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <div
              style={{
                display: 'flex',
                padding: '10px 18px',
                borderRadius: '999px',
                background: palette.badgeBg,
                border: `1px solid ${palette.border}`,
                color: palette.badgeText,
                fontSize: '18px',
                fontWeight: 600,
              }}
            >
              {presentation.sectionCount} sections
            </div>
            <div
              style={{
                display: 'flex',
                padding: '10px 18px',
                borderRadius: '999px',
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: '#f4f4f5',
                fontSize: '18px',
                fontWeight: 600,
              }}
            >
              {presentation.itemCount} items
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'stretch',
            gap: '32px',
            width: '100%',
            flex: 1,
            marginTop: '32px',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '20px',
              flex: 1,
              maxWidth: resolvedCoverImageUrl ? '54%' : '100%',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '20px',
              }}
            >
              <div
                style={{
                  fontSize: presentation.title.length > 72 ? '54px' : '66px',
                  lineHeight: 1.08,
                  fontWeight: 700,
                  display: '-webkit-box',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                }}
              >
                {presentation.title}
              </div>
              <div
                style={{
                  fontSize: '28px',
                  lineHeight: 1.42,
                  color: '#d4d4d8',
                  display: '-webkit-box',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  WebkitLineClamp: 4,
                  WebkitBoxOrient: 'vertical',
                  maxWidth: '100%',
                }}
              >
                {presentation.description}
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                gap: '12px',
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  width: '12px',
                  height: '12px',
                  borderRadius: '999px',
                  background: palette.secondary,
                }}
              />
              <div
                style={{
                  fontSize: '18px',
                  color: '#d4d4d8',
                }}
              >
                {strings.brand}
              </div>
            </div>
          </div>
          {resolvedCoverImageUrl ? (
            <div
              style={{
                position: 'relative',
                display: 'flex',
                flex: 1,
                overflow: 'hidden',
                borderRadius: '28px',
                border: `1px solid ${palette.border}`,
                background: 'rgba(255,255,255,0.04)',
                boxShadow: '0 18px 48px rgba(0,0,0,0.28)',
              }}
            >
              {/* biome-ignore lint/performance/noImgElement: ImageResponse requires standard img elements for generated OG images. */}
              <img
                src={resolvedCoverImageUrl}
                alt=""
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background:
                    'linear-gradient(180deg, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.3) 100%)',
                }}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    size
  );
}
