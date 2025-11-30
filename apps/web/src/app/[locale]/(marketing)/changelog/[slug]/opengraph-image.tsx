import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Tuturuuu Changelog';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

interface Props {
  params: Promise<{
    slug: string;
  }>;
}

const categoryColors: Record<string, { bg: string; text: string }> = {
  feature: { bg: '#22c55e20', text: '#22c55e' },
  improvement: { bg: '#3b82f620', text: '#3b82f6' },
  bugfix: { bg: '#f9731620', text: '#f97316' },
  breaking: { bg: '#ef444420', text: '#ef4444' },
  security: { bg: '#a855f720', text: '#a855f7' },
  performance: { bg: '#06b6d420', text: '#06b6d4' },
};

const categoryLabels: Record<string, string> = {
  feature: 'New Feature',
  improvement: 'Improvement',
  bugfix: 'Bug Fix',
  breaking: 'Breaking Change',
  security: 'Security',
  performance: 'Performance',
};

export default async function Image({ params }: Props) {
  const { slug } = await params;

  // Fetch changelog data
  const supabase = await createAdminClient();
  const { data: changelog } = await supabase
    .from('changelog_entries')
    .select('title, category, version, published_at, cover_image_url')
    .eq('slug', slug)
    .eq('is_published', true)
    .single();

  if (!changelog) {
    // Fallback image for not found
    return new ImageResponse(
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0a0a0a',
          backgroundImage:
            'radial-gradient(circle at 25% 25%, #7c3aed20 0%, transparent 50%), radial-gradient(circle at 75% 75%, #3b82f620 0%, transparent 50%)',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 48,
            fontWeight: 700,
            color: '#ffffff',
          }}
        >
          Changelog Not Found
        </div>
      </div>,
      { ...size }
    );
  }

  const categoryColor = categoryColors[changelog.category] || {
    bg: '#71717a20',
    text: '#71717a',
  };
  const categoryLabel =
    categoryLabels[changelog.category] || changelog.category;
  const formattedDate = changelog.published_at
    ? new Date(changelog.published_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '';

  return new ImageResponse(
    <div
      style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#0a0a0a',
        backgroundImage:
          'radial-gradient(circle at 10% 20%, #7c3aed15 0%, transparent 40%), radial-gradient(circle at 90% 80%, #3b82f615 0%, transparent 40%)',
        padding: 60,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 40,
        }}
      >
        {/* Logo */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: 24, color: 'white', fontWeight: 700 }}>
              T
            </span>
          </div>
          <span style={{ fontSize: 28, color: '#a1a1aa', fontWeight: 500 }}>
            Tuturuuu Changelog
          </span>
        </div>

        {/* Category Badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div
            style={{
              padding: '8px 20px',
              borderRadius: 9999,
              backgroundColor: categoryColor.bg,
              color: categoryColor.text,
              fontSize: 20,
              fontWeight: 600,
            }}
          >
            {categoryLabel}
          </div>
          {changelog.version && (
            <div
              style={{
                padding: '8px 20px',
                borderRadius: 9999,
                backgroundColor: '#27272a',
                color: '#a1a1aa',
                fontSize: 20,
                fontWeight: 500,
                fontFamily: 'monospace',
              }}
            >
              v{changelog.version}
            </div>
          )}
        </div>
      </div>

      {/* Title */}
      <div
        style={{
          display: 'flex',
          flex: 1,
          alignItems: 'center',
        }}
      >
        <h1
          style={{
            fontSize: changelog.title.length > 60 ? 56 : 72,
            fontWeight: 700,
            color: '#ffffff',
            lineHeight: 1.2,
            margin: 0,
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {changelog.title}
        </h1>
      </div>

      {/* Footer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 40,
          borderTop: '1px solid #27272a',
          paddingTop: 30,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: '#71717a',
            fontSize: 22,
          }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <title>Calendar</title>
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <span>{formattedDate}</span>
        </div>

        <div
          style={{
            color: '#71717a',
            fontSize: 20,
          }}
        >
          tuturuuu.com/changelog
        </div>
      </div>
    </div>,
    {
      ...size,
    }
  );
}
