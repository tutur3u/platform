import { useTranslations } from 'next-intl';
import { HeroVignettesLeft, HeroVignettesRight } from './hero-vignettes';
import { poster } from './hero-assets';
import { VideoPlayer } from './video-player';

/** Browser chrome: traffic lights, an active tab, and the address pill. */
function FrameChrome({ tabLabel }: { tabLabel: string }) {
  return (
    <div
      aria-hidden
      className="flex items-center gap-3 border-foreground/[0.06] border-b bg-foreground/[0.02] px-3 py-2"
    >
      <div className="flex shrink-0 gap-1.5 pl-1">
        <span className="h-2.5 w-2.5 rounded-full bg-dynamic-red/50" />
        <span className="h-2.5 w-2.5 rounded-full bg-dynamic-yellow/50" />
        <span className="h-2.5 w-2.5 rounded-full bg-dynamic-green/50" />
      </div>

      {/* Active tab */}
      <div className="hidden min-w-0 max-w-[13rem] flex-1 items-center gap-2 rounded-t-md border-foreground/[0.06] border-x border-t bg-background/70 px-2.5 py-1 sm:flex">
        <span className="h-2 w-2 shrink-0 rounded-[3px] bg-[linear-gradient(120deg,var(--purple),var(--blue))]" />
        <span className="truncate font-mono-ui text-[0.6rem] text-foreground/45">
          {tabLabel}
        </span>
      </div>

      {/* Address pill */}
      <div className="ml-auto hidden items-center gap-1.5 rounded-full border border-foreground/[0.07] bg-background/60 px-2.5 py-1 sm:flex">
        <span className="h-1.5 w-1.5 rounded-full bg-dynamic-green/70" />
        <span className="font-mono-ui text-[0.6rem] text-foreground/35 tracking-[0.1em]">
          tuturuuu.com
        </span>
      </div>

      {/* Compact fallback for narrow frames */}
      <span className="mx-auto font-mono-ui text-[0.62rem] text-foreground/35 tracking-[0.12em] sm:hidden">
        tuturuuu.com
      </span>
    </div>
  );
}

export function VideoHero() {
  const t = useTranslations('landing.hero.video');
  const privacy = useTranslations('privacy-consent');
  return (
    <div className="relative" data-video-hero>
      <div data-video-decorations>
        <HeroVignettesLeft />
        <HeroVignettesRight />
      </div>
      <div className="relative overflow-hidden rounded-xl bg-background">
        <FrameChrome tabLabel={t('tab')} />
        <div className="relative aspect-video w-full">
          <img
            alt={t('thumbnail')}
            className="absolute inset-0 block h-full w-full object-cover"
            src={poster.src}
            srcSet={poster.srcSet}
            sizes={poster.sizes}
            width={1280}
            height={720}
            loading="eager"
            fetchPriority="high"
            decoding="async"
          />
          <VideoPlayer
            title={t('title')}
            playLabel={`${t('watchNow')} — ${privacy('play_youtube')}`}
            watchNow={t('watchNow')}
          />
        </div>
      </div>
    </div>
  );
}
