import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { generateFunName } from '@tuturuuu/utils/name-helper';
import { ImageResponse } from 'next/og';

export const dynamic = 'force-dynamic';

export async function GET(
  _: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId: rawUserId } = await params;

    const sbAdmin = await createAdminClient();

    // remove all dashes, then re-add them in the format of UUID
    const userId = rawUserId
      .replace(/-/g, '')
      .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');

    // Fetch user data
    const { data: userData, error: userError } = await sbAdmin
      .from('users')
      .select('id, display_name, avatar_url')
      .eq('id', userId)
      .single();

    if (userError || !userData) {
      return new Response('User not found', { status: 404 });
    }

    const userName =
      userData.display_name || generateFunName({ id: userData.id });

    // Fetch user's total score
    const { data: submissionsData = [], error: submissionsError } =
      await sbAdmin
        .from('nova_submissions_with_scores')
        .select('total_score')
        .eq('user_id', userId);

    if (submissionsError) {
      console.error(submissionsError);
    }

    const totalScore = (submissionsData || []).reduce(
      (sum, submission) => sum + (submission.total_score || 0),
      0
    );

    // Get challenge count
    const { count: challengeCount } = await sbAdmin
      .from('nova_sessions')
      .select('challenge_id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .filter('challenge_id', 'not.is', null);

    return new ImageResponse(
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#030303',
          backgroundImage:
            'radial-gradient(circle at 25% 25%, rgba(37, 99, 235, 0.15), transparent), radial-gradient(circle at 75% 75%, rgba(56, 189, 248, 0.15), transparent), radial-gradient(circle at 50% 50%, rgba(14, 165, 233, 0.1), transparent)',
        }}
      >
        {/* Grid pattern overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'linear-gradient(to right, rgba(255, 255, 255, 0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(255, 255, 255, 0.08) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
            mixBlendMode: 'overlay',
            opacity: 0.4,
          }}
        />

        <div
          style={{
            display: 'flex',
            width: '100%',
            height: '100%',
            padding: '80px',
            alignItems: 'center',
            gap: '80px',
            position: 'relative',
          }}
        >
          {/* Content side */}
          <div
            style={{
              display: 'flex',
              flex: '1',
              flexDirection: 'column',
              gap: '40px',
              position: 'relative',
            }}
          >
            {/* Nova Logo */}
            <div
              style={{
                display: 'flex',
                fontSize: '60px',
                fontWeight: '900',
                background:
                  'linear-gradient(to right, #2563eb, #38bdf8, #0ea5e9)',
                backgroundClip: 'text',
                color: 'transparent',
                letterSpacing: '-0.03em',
                filter: 'drop-shadow(0 0 40px rgba(37, 99, 235, 0.4))',
              }}
            >
              Nova
            </div>

            {/* User Name */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                fontSize: '72px',
                fontWeight: '800',
                color: 'white',
                lineHeight: 1.1,
                letterSpacing: '-0.02em',
              }}
            >
              {userName}
            </div>

            {/* User Stats */}
            <div
              style={{
                display: 'flex',
                gap: '24px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  background: 'rgba(255, 255, 255, 0.1)',
                  padding: '16px 24px',
                  borderRadius: '12px',
                }}
              >
                <span
                  style={{
                    fontSize: '40px',
                    fontWeight: '700',
                    color: 'white',
                  }}
                >
                  {totalScore}
                </span>
                <span
                  style={{
                    fontSize: '20px',
                    color: 'rgba(255, 255, 255, 0.7)',
                  }}
                >
                  Total Score
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  background: 'rgba(255, 255, 255, 0.1)',
                  padding: '16px 24px',
                  borderRadius: '12px',
                }}
              >
                <span
                  style={{
                    fontSize: '40px',
                    fontWeight: '700',
                    color: 'white',
                  }}
                >
                  {challengeCount || 0}
                </span>
                <span
                  style={{
                    fontSize: '20px',
                    color: 'rgba(255, 255, 255, 0.7)',
                  }}
                >
                  Challenges
                </span>
              </div>
            </div>

            {/* Description */}
            <div
              style={{
                display: 'flex',
                fontSize: '24px',
                fontWeight: '500',
                background:
                  'linear-gradient(to right, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.7))',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              Prompt Engineering Profile
            </div>
          </div>

          {/* Avatar side */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
            }}
          >
            {/* Enhanced glow effect */}
            <div
              style={{
                position: 'absolute',
                width: '400px',
                height: '400px',
                background:
                  'radial-gradient(circle at 50% 50%, rgba(37, 99, 235, 0.2), transparent 70%)',
                filter: 'blur(50px)',
                transform: 'translate(-50%, -50%)',
                top: '50%',
                left: '50%',
              }}
            />
            <img
              width="320"
              height="320"
              src={
                userData.avatar_url ||
                `https://api.dicebear.com/7.x/identicon/png?seed=${userId}&size=320`
              }
              alt="User Avatar"
              style={{
                borderRadius: '160px',
                position: 'relative',
                boxShadow:
                  '0 0 60px rgba(0, 0, 0, 0.6), 0 0 30px rgba(37, 99, 235, 0.3)',
                objectFit: 'cover',
              }}
            />
          </div>
        </div>
      </div>,
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (e: unknown) {
    console.error(e);
    return new Response('Failed to generate profile OG image', { status: 500 });
  }
}
