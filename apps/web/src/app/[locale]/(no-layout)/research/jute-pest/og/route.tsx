import { DEV_MODE } from '@/constants/common';
import { ImageResponse } from 'next/og';

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #ffffff 0%, #f8f9ff 100%)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          width="906"
          height="406"
          src={
            DEV_MODE
              ? 'http://localhost:7803/media/rmit-light.png'
              : 'https://tuturuuu.com/media/rmit-light.png'
          }
          style={{
            width: '453px',
            height: '203px',
            transform: 'translateX(-48px)',
          }}
        />
        {/* Background Decorative Elements */}
        <div
          style={{
            position: 'absolute',
            top: '-10%',
            right: '-10%',
            width: '600px',
            height: '600px',
            background:
              'radial-gradient(circle, rgba(0, 98, 216, 0.03) 0%, rgba(0, 98, 216, 0) 70%)',
            borderRadius: '50%',
            transform: 'rotate(-15deg)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '-15%',
            left: '-10%',
            width: '500px',
            height: '500px',
            background:
              'radial-gradient(circle, rgba(0, 167, 111, 0.03) 0%, rgba(0, 167, 111, 0) 70%)',
            borderRadius: '50%',
            transform: 'rotate(15deg)',
          }}
        />

        {/* Top Accent Line */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '4px',
            background: 'linear-gradient(to right, #0062d8, #00a76f)',
          }}
        />

        {/* Title Section */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginBottom: '40px',
            position: 'relative',
            zIndex: 1,
          }}
        >
          <div
            style={{
              fontSize: 20,
              color: '#0062d8',
              textTransform: 'uppercase',
              letterSpacing: '0.15em',
              marginBottom: '16px',
              fontWeight: 600,
            }}
          >
            Research Project
          </div>
          <h1
            style={{
              fontSize: 76,
              fontWeight: 800,
              background: 'linear-gradient(135deg, #0062d8 0%, #00a76f 100%)',
              backgroundClip: 'text',
              color: 'transparent',
              textAlign: 'center',
              marginBottom: '20px',
              lineHeight: 1.1,
            }}
          >
            Jute Pest Research
          </h1>
          <p
            style={{
              fontSize: 28,
              color: '#4b5563',
              textAlign: 'center',
              maxWidth: '800px',
              lineHeight: 1.4,
              fontWeight: 500,
            }}
          >
            Advanced Morphological Feature Analysis & Classification
          </p>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
