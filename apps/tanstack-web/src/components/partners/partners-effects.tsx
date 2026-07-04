import { Award, Sparkles, Target, Zap } from '@tuturuuu/icons/lucide';

export function PartnersEffects() {
  return (
    <>
      <style>{`
        @keyframes partners-orb-a {
          0%, 100% { transform: scale(1); opacity: 0.3; }
          50% { transform: scale(1.2); opacity: 0.4; }
        }
        @keyframes partners-orb-b {
          0%, 100% { transform: scale(1); opacity: 0.2; }
          50% { transform: scale(1.3); opacity: 0.35; }
        }
        @keyframes partners-orb-c {
          0%, 100% { transform: translateX(-50%) scale(1); opacity: 0.25; }
          50% { transform: translateX(-50%) scale(1.25); opacity: 0.35; }
        }
        @keyframes partners-float-soft {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-20px) rotate(5deg); }
        }
        @keyframes partners-float-reverse {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-15px) rotate(-5deg); }
        }
        @keyframes partners-float-scale {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-25px) scale(1.1); }
        }
        @keyframes partners-spin {
          to { transform: translate(-50%, -50%) rotate(360deg); }
        }
        @keyframes partners-pulse-dot {
          0%, 100% { transform: scale(1); opacity: 0.4; }
          50% { transform: scale(1.2); opacity: 0.7; }
        }
        @keyframes partners-ring {
          0%, 100% { box-shadow: 0 0 0 0 currentColor; }
          50% { box-shadow: 0 0 0 4px transparent; }
        }
      `}</style>
      <div
        className="fixed top-0 -left-32 h-96 w-96 rounded-full bg-linear-to-br from-dynamic-purple/40 via-dynamic-pink/30 to-transparent blur-3xl sm:-left-64"
        style={{ animation: 'partners-orb-a 8s ease-in-out infinite' }}
      />
      <div
        className="fixed top-1/4 -right-32 h-96 w-96 rounded-full bg-linear-to-br from-dynamic-blue/40 via-dynamic-cyan/30 to-transparent blur-3xl sm:-right-64"
        style={{ animation: 'partners-orb-b 10s ease-in-out 1s infinite' }}
      />
      <div
        className="fixed bottom-0 left-1/2 h-96 w-96 rounded-full bg-linear-to-br from-dynamic-pink/30 via-dynamic-purple/30 to-transparent blur-3xl"
        style={{ animation: 'partners-orb-c 9s ease-in-out 2s infinite' }}
      />
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.015]"
        style={{
          backgroundImage: `
            linear-gradient(to right, currentColor 1px, transparent 1px),
            linear-gradient(to bottom, currentColor 1px, transparent 1px)
          `,
          backgroundSize: '4rem 4rem',
        }}
      />
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.02]"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, transparent 0%, currentColor 100%)',
        }}
      />
    </>
  );
}

export function DecorativeFloatingIcons() {
  return (
    <div className="pointer-events-none relative mb-24">
      <div className="container mx-auto px-6 sm:px-8 lg:px-12">
        <div className="relative h-32">
          <div
            className="absolute top-1/2 left-[10%]"
            style={{ animation: 'partners-float-soft 6s ease-in-out infinite' }}
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-linear-to-br from-dynamic-purple/20 to-dynamic-pink/10 shadow-dynamic-purple/20 shadow-lg backdrop-blur-xl">
              <Sparkles className="h-8 w-8 text-dynamic-purple" />
            </div>
          </div>
          <div
            className="absolute top-1/4 right-[15%]"
            style={{
              animation: 'partners-float-reverse 5s ease-in-out 1s infinite',
            }}
          >
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-linear-to-br from-dynamic-orange/20 to-dynamic-red/10 shadow-dynamic-orange/20 shadow-lg backdrop-blur-xl">
              <Target className="h-10 w-10 text-dynamic-orange" />
            </div>
          </div>
          <div
            className="absolute top-0 left-[60%]"
            style={{
              animation: 'partners-float-scale 7s ease-in-out 2s infinite',
            }}
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-linear-to-br from-dynamic-blue/20 to-dynamic-cyan/10 shadow-dynamic-blue/20 shadow-lg backdrop-blur-xl">
              <Award className="h-7 w-7 text-dynamic-blue" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DecorativeConnector() {
  return (
    <div className="pointer-events-none relative mb-20">
      <div className="container mx-auto px-6 sm:px-8 lg:px-12">
        <div className="relative h-24">
          <div
            className="absolute top-1/2 left-1/2"
            style={{ animation: 'partners-spin 20s linear infinite' }}
          >
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-linear-to-br from-dynamic-cyan/20 via-dynamic-blue/20 to-dynamic-purple/20 shadow-2xl shadow-dynamic-blue/30 ring-2 ring-dynamic-blue/40 backdrop-blur-xl">
              <Zap className="h-10 w-10 text-dynamic-blue" />
            </div>
          </div>
          <div
            className="absolute top-1/2 left-[30%] -translate-y-1/2"
            style={{ animation: 'partners-pulse-dot 3s ease-in-out infinite' }}
          >
            <div className="h-3 w-3 rounded-full bg-linear-to-r from-dynamic-cyan to-dynamic-blue shadow-dynamic-cyan/50 shadow-lg" />
          </div>
          <div
            className="absolute top-1/2 right-[30%] -translate-y-1/2"
            style={{
              animation: 'partners-pulse-dot 3s ease-in-out 0.5s infinite',
            }}
          >
            <div className="h-3 w-3 rounded-full bg-linear-to-r from-dynamic-purple to-dynamic-pink shadow-dynamic-purple/50 shadow-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}
