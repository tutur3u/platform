import { cn } from '@tuturuuu/utils/format';

export function AppsGatewayAtmosphere({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 -z-10', className)}
    >
      <div className="absolute -top-52 left-1/2 h-[46rem] w-[58rem] -translate-x-1/2 animate-bloom-drift rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--purple)_38%,transparent),transparent)] opacity-50 blur-3xl motion-reduce:animate-none dark:opacity-60" />
      <div className="absolute -top-24 right-[4%] h-[32rem] w-[38rem] animate-bloom-drift-slow rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--blue)_34%,transparent),transparent)] opacity-40 blur-3xl motion-reduce:animate-none dark:opacity-55" />
      <div className="absolute top-[28rem] left-[-8rem] h-[32rem] w-[36rem] animate-bloom-drift rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--cyan)_28%,transparent),transparent)] opacity-35 blur-3xl [animation-delay:-8s] motion-reduce:animate-none dark:opacity-45" />
      <div className="absolute inset-x-0 top-0 h-px animate-sheen bg-[linear-gradient(90deg,transparent,color-mix(in_oklab,var(--purple)_55%,transparent)_35%,color-mix(in_oklab,var(--cyan)_55%,transparent)_65%,transparent)] motion-reduce:animate-none" />
      <div
        className="absolute inset-0 opacity-50 dark:opacity-35"
        style={{
          backgroundImage:
            'linear-gradient(to right, color-mix(in oklab, var(--foreground) 6%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, var(--foreground) 6%, transparent) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          maskImage:
            'radial-gradient(ellipse 82% 58% at 50% 30%, black 18%, transparent 76%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 82% 58% at 50% 30%, black 18%, transparent 76%)',
        }}
      />
      <div className="absolute inset-x-0 bottom-0 h-80 bg-gradient-to-b from-transparent to-background" />
      <div
        className="absolute inset-0 opacity-[0.035] mix-blend-overlay dark:opacity-[0.055]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  );
}
