import { ArrowRight, Sparkles } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { TrustBadges } from './trust-badges';
import { VideoHero } from './video-hero';

export function HeroSection() {
  const t = useTranslations('landing.hero');

  return (
    <section className="relative flex min-h-dvh flex-col justify-center px-4 pt-16 pb-12 sm:min-h-0 sm:px-6 sm:pt-20 sm:pb-16 lg:px-8 lg:pt-24 lg:pb-20">
      {/* Aurora Background - Hidden on mobile, single optimized layer on md+ */}
      <div
        className="pointer-events-none absolute inset-x-0 -top-[53px] bottom-0 -z-20 hidden overflow-hidden md:block"
        style={
          {
            '--blue-300': '#93c5fd',
            '--blue-400': '#60a5fa',
            '--indigo-300': '#a5b4fc',
            '--violet-200': '#ddd6fe',
            '--purple-400': '#c084fc',
          } as React.CSSProperties
        }
      >
        <div
          className="absolute -inset-[10px] opacity-50 blur-[8px] invert filter [background-image:var(--white-gradient),var(--aurora)] [background-position:50%_50%,50%_50%] [background-size:300%,_200%] after:absolute after:inset-0 after:animate-aurora after:mix-blend-difference after:content-[''] motion-reduce:animate-none after:motion-reduce:animate-none dark:invert-0 after:[background-attachment:fixed] after:[background-image:var(--white-gradient),var(--aurora)] after:[background-size:200%,_100%]"
          style={
            {
              '--aurora':
                'repeating-linear-gradient(100deg, var(--purple-400) 10%, var(--indigo-300) 15%, var(--blue-300) 20%, var(--violet-200) 25%, var(--blue-400) 30%)',
              '--white-gradient':
                'repeating-linear-gradient(100deg, #fff 0%, #fff 7%, transparent 10%, transparent 12%, #fff 16%)',
            } as React.CSSProperties
          }
        />
      </div>

      {/* Subtle Grid Background - Hidden on mobile for performance */}
      <div className="pointer-events-none absolute inset-0 -z-[5] hidden sm:block">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--foreground)/0.02)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--foreground)/0.02)_1px,transparent_1px)] bg-[size:4rem_4rem]" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />
      </div>

      <div className="mx-auto max-w-6xl">
        {/* Compact Header */}
        <div className="mb-8 text-center sm:mb-10">
          {/* Badge */}
          <div>
            <Badge
              variant="secondary"
              className="mb-4 gap-1.5 border-foreground/10 bg-foreground/5 px-3 py-1.5 text-foreground/70 backdrop-blur-sm"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {t('badge')}
            </Badge>
          </div>

          {/* Headline */}
          <h1 className="mx-auto mb-4 max-w-4xl font-bold text-3xl tracking-tight sm:text-4xl md:text-5xl lg:text-6xl">
            <span>{t('title.line1')}</span>{' '}
            <span className="bg-gradient-to-r from-dynamic-purple via-dynamic-blue to-dynamic-cyan bg-clip-text text-transparent">
              {t('title.line2')}
            </span>
          </h1>

          {/* Description */}
          <p className="mx-auto mb-6 max-w-2xl text-balance text-base text-foreground/60 leading-relaxed sm:text-lg">
            {t('description')}
          </p>

          {/* CTAs */}
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
            <Button
              size="lg"
              className="group w-full bg-gradient-to-r from-dynamic-purple to-dynamic-blue px-8 font-medium text-white shadow-dynamic-purple/25 shadow-lg transition-all hover:shadow-dynamic-purple/30 hover:shadow-xl sm:w-auto"
              asChild
            >
              <Link href="/onboarding">
                {t('cta.primary')}
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Button>
          </div>
        </div>

        {/* Video - The Star of the Show */}
        <div className="mb-8 sm:mb-10">
          <VideoHero />
        </div>

        {/* Trust Badges */}
        <TrustBadges />
      </div>
    </section>
  );
}
