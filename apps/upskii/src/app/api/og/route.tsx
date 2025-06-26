import Image from 'next/image';
import { ImageResponse } from 'next/og';

export const dynamic = 'force-static';

export async function GET() {
  try {
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
            {/* Upskii Logo */}
            <div
              style={{
                display: 'flex',
                fontSize: '120px',
                fontWeight: '900',
                background:
                  'linear-gradient(to right, #2563eb, #38bdf8, #0ea5e9)',
                backgroundClip: 'text',
                color: 'transparent',
                letterSpacing: '-0.03em',
                filter: 'drop-shadow(0 0 40px rgba(37, 99, 235, 0.4))',
              }}
            >
              Upskii
            </div>

            {/* Title */}
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
              <span>Education for</span>
              <span>Everyone</span>
            </div>

            {/* Description */}
            <div
              style={{
                display: 'flex',
                fontSize: '32px',
                fontWeight: '500',
                background:
                  'linear-gradient(to right, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.7))',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              by Tuturuuu
            </div>
          </div>

          {/* Logo side */}
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
            <Image
              width={320}
              height={320}
              src="/media/github-mark.png"
              alt="Tuturuuu Logo"
              className="rounded-full"
              style={{
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
    return new Response('Failed to generate OG image', { status: 500 });
  }
}
