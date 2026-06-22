import {
  ArrowRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  MessageSquare,
  Play,
  Sparkles,
} from '@tuturuuu/icons/lucide';
import type { LandingContent } from './landing-content';
import { ActionLink, joinClassNames } from './landing-primitives';

const YOUTUBE_VIDEO_ID = 'JGWbvaAC24Q';

const previewIcons = [CheckCircle2, Calendar, MessageSquare, BarChart3];
const previewStyles = [
  'border-dynamic-green/20 bg-dynamic-green/5 text-dynamic-green',
  'border-dynamic-blue/20 bg-dynamic-blue/5 text-dynamic-blue',
  'border-dynamic-purple/20 bg-dynamic-purple/5 text-dynamic-purple',
  'border-dynamic-cyan/20 bg-dynamic-cyan/5 text-dynamic-cyan',
];

export function LandingHero({
  content,
}: Readonly<{ content: LandingContent['hero'] }>) {
  return (
    <section className="relative flex min-h-dvh flex-col justify-center px-4 pt-16 pb-12 sm:min-h-0 sm:px-6 sm:pt-20 sm:pb-16 lg:px-8 lg:pt-24 lg:pb-20">
      <div className="pointer-events-none absolute inset-0 -z-10 hidden sm:block">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--foreground)/0.025)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--foreground)/0.025)_1px,transparent_1px)] bg-[size:4rem_4rem]" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/20 to-background" />
      </div>

      <div className="mx-auto grid w-full max-w-6xl items-center gap-10 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="text-center lg:text-left">
          <span className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-foreground/10 bg-foreground/5 px-3 py-1.5 font-medium text-foreground/70 text-xs backdrop-blur-sm">
            <Sparkles className="h-3.5 w-3.5" />
            {content.badge}
          </span>

          <h1 className="mx-auto max-w-4xl font-bold text-4xl tracking-normal sm:text-5xl lg:mx-0 lg:text-6xl">
            <span>{content.title.line1}</span>{' '}
            <span className="bg-gradient-to-r from-dynamic-purple via-dynamic-blue to-dynamic-cyan bg-clip-text text-transparent">
              {content.title.line2}
            </span>
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-balance text-base text-foreground/60 leading-relaxed sm:text-lg lg:mx-0">
            {content.description}
          </p>

          <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row lg:items-start">
            <ActionLink href="/onboarding">
              {content.primaryCta}
              <ArrowRight className="h-4 w-4" />
            </ActionLink>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4 text-foreground/55 text-sm sm:gap-6 lg:justify-start">
            {content.trust.map((badge) => (
              <div className="flex items-center gap-2" key={badge}>
                <CheckCircle2 className="h-4 w-4 text-dynamic-green" />
                <span>{badge}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <VideoPreview video={content.video} />
          <ProductPreview cards={content.previewCards} />
        </div>
      </div>
    </section>
  );
}

function VideoPreview({
  video,
}: Readonly<{ video: LandingContent['hero']['video'] }>) {
  return (
    <a
      aria-label={video.watchNow}
      className="group relative block overflow-hidden rounded-lg border border-foreground/10 bg-background shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      href={`https://www.youtube-nocookie.com/embed/${YOUTUBE_VIDEO_ID}`}
      rel="noreferrer"
      target="_blank"
    >
      <div className="flex items-center gap-2 border-foreground/5 border-b bg-foreground/[0.02] px-4 py-2.5">
        <div className="h-2.5 w-2.5 rounded-full bg-dynamic-red/60" />
        <div className="h-2.5 w-2.5 rounded-full bg-dynamic-yellow/60" />
        <div className="h-2.5 w-2.5 rounded-full bg-dynamic-green/60" />
        <span className="mx-auto font-mono text-foreground/40 text-xs">
          tuturuuu.com
        </span>
      </div>
      <div className="relative aspect-video">
        <img
          alt={video.thumbnail}
          className="h-full w-full object-cover opacity-90 transition duration-500 group-hover:scale-[1.02] group-hover:opacity-100"
          src={`https://img.youtube.com/vi/${YOUTUBE_VIDEO_ID}/maxresdefault.jpg`}
        />
        <div className="absolute inset-0 flex items-center justify-center bg-background/20">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-dynamic-purple via-dynamic-blue to-dynamic-cyan text-white shadow-2xl transition-transform group-hover:scale-105 sm:h-20 sm:w-20">
            <Play className="h-7 w-7 translate-x-0.5 sm:h-8 sm:w-8" />
          </div>
        </div>
        <div className="absolute right-4 bottom-4 left-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-white/15 bg-background/85 px-4 py-3 backdrop-blur">
          <span className="font-medium text-sm">{video.badge}</span>
          <span className="text-foreground/60 text-sm">{video.watchNow}</span>
        </div>
      </div>
    </a>
  );
}

function ProductPreview({
  cards,
}: Readonly<{ cards: LandingContent['hero']['previewCards'] }>) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {cards.map((card, index) => {
        const Icon = previewIcons[index] ?? CheckCircle2;
        return (
          <div
            className={joinClassNames(
              'rounded-lg border p-3',
              previewStyles[index]
            )}
            key={card.label}
          >
            <div className="mb-2 flex items-center gap-2">
              <Icon className="h-4 w-4" />
              <span className="font-medium text-foreground text-sm">
                {card.label}
              </span>
            </div>
            <div className="space-y-1">
              {card.items.map((item) => (
                <div
                  className="truncate rounded-md bg-background/70 px-2 py-1 text-foreground/60 text-xs"
                  key={item}
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
