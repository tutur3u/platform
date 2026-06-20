const confettiPieces = [
  { color: 'bg-dynamic-pink', delay: '0s', left: '8%', rotate: '18deg' },
  { color: 'bg-dynamic-cyan', delay: '0.15s', left: '16%', rotate: '-12deg' },
  { color: 'bg-dynamic-amber', delay: '0.3s', left: '25%', rotate: '26deg' },
  { color: 'bg-dynamic-green', delay: '0.45s', left: '36%', rotate: '-22deg' },
  { color: 'bg-dynamic-purple', delay: '0.6s', left: '48%', rotate: '14deg' },
  { color: 'bg-dynamic-blue', delay: '0.75s', left: '61%', rotate: '-16deg' },
  { color: 'bg-dynamic-pink', delay: '0.9s', left: '72%', rotate: '28deg' },
  { color: 'bg-dynamic-amber', delay: '1.05s', left: '84%', rotate: '-28deg' },
  { color: 'bg-dynamic-green', delay: '1.2s', left: '92%', rotate: '10deg' },
] as const;

export function ContributorsEffects() {
  return (
    <>
      <style>{`
        @keyframes contributors-confetti-fall {
          0% { opacity: 0; transform: translate3d(0, -12vh, 0) rotate(0deg); }
          12% { opacity: 0.9; }
          100% { opacity: 0; transform: translate3d(24px, 78vh, 0) rotate(420deg); }
        }
        @keyframes contributors-grid-drift {
          0%, 100% { transform: translate3d(0, 0, 0); }
          50% { transform: translate3d(0, -16px, 0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .contributors-confetti-piece,
          .contributors-grid-drift {
            animation: none !important;
          }
        }
      `}</style>

      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div
          className="contributors-grid-drift absolute inset-0 opacity-30"
          style={{
            animation: 'contributors-grid-drift 18s ease-in-out infinite',
          }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.08)_1px,transparent_1px)] bg-[size:32px_32px]" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(var(--primary-rgb),0.04)_1px,transparent_1px)] bg-[size:120px]" />
        </div>
      </div>

      <div aria-hidden className="pointer-events-none fixed inset-0 z-10">
        {confettiPieces.map((piece, index) => (
          <span
            className={`contributors-confetti-piece absolute top-0 h-3 w-1.5 rounded-sm ${piece.color}`}
            key={`${piece.left}-${piece.delay}`}
            style={{
              animation: `contributors-confetti-fall 4.5s ease-out ${piece.delay} 1 both`,
              left: piece.left,
              transform: `rotate(${piece.rotate})`,
              width: index % 3 === 0 ? '0.35rem' : '0.5rem',
            }}
          />
        ))}
      </div>
    </>
  );
}
