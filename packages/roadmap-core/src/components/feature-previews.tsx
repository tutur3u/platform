import { useEffect, useState } from 'react';
import {
  type DeviceGroup,
  deviceGroups,
  type Feature,
  hasVariants,
  pickImage,
  type PreviewTheme,
} from '../content/feature-previews';
import { Segmented } from './ds/segmented';
import { fill } from './insights/format';
import type { Lang, Messages } from './shared';

type Props = {
  features: readonly Feature[];
  lang: Lang;
  t: Messages['featurePreviews'];
};

/** The page's theme: the `dark` class the theme toggle sets on <html>. */
function usePageTheme(): PreviewTheme | null {
  const [theme, setTheme] = useState<PreviewTheme | null>(null);
  useEffect(() => {
    const root = document.documentElement;
    const read = () =>
      setTheme(root.classList.contains('dark') ? 'dark' : 'light');
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return theme;
}

/**
 * Real screens of the current design for each feature: a device switch
 * (iPhone, iPad, Mac, iPhone Duo), a theme switch that starts on the page's
 * theme, and a rail of features. Only the selected image loads; the panel
 * it sits in is hidden until its tab opens, so nothing loads before then.
 */
export function FeaturePreviews({ features, lang, t }: Props) {
  const pageTheme = usePageTheme();
  const [index, setIndex] = useState(0);
  const [group, setGroup] = useState<DeviceGroup>('iphone');
  const [variant, setVariant] = useState<0 | 1>(0);
  const [chosenTheme, setTheme] = useState<PreviewTheme | null>(null);
  const theme = chosenTheme ?? pageTheme ?? 'light';
  const feature = features[index] ?? features[0];
  if (!feature) return null;

  const picked = pickImage(feature, { group, variant, theme, lang });
  if (!picked) return null;
  const { image } = picked;
  const groups = deviceGroups(feature);
  const variants = hasVariants(feature, picked.group);
  const device = t.devices[image.device];
  const alt = fill(t.alt, {
    feature: feature.title[lang],
    device,
    theme: t.themes[image.theme],
  });
  // Until the page theme is read, a same-size placeholder stands in, so a
  // dark page never downloads the light image first.
  const ready = chosenTheme !== null || pageTheme !== null;
  const variantGroup = picked.group === 'duo' ? 'duo' : 'ipad';
  const size =
    image.width > image.height
      ? 'w-full max-w-2xl'
      : 'max-h-[34rem] w-auto max-w-full';
  // The placeholder takes the image's box: full width for a landscape
  // capture, and for a portrait one the width the 34rem height cap allows,
  // never wider than the column. An empty box with only an aspect ratio and
  // no width would collapse.
  const ratio = image.width / image.height;
  const skeletonWidth = image.width > image.height ? 'w-full max-w-2xl' : '';
  const skeletonStyle =
    image.width > image.height
      ? { aspectRatio: ratio }
      : { aspectRatio: ratio, width: `min(100%, ${34 * ratio}rem)` };

  return (
    <section
      id="feature-previews"
      aria-labelledby="feature-previews-title"
      className="relative grid scroll-mt-24 gap-5 overflow-hidden rounded-3xl border bg-card p-4 sm:p-6 lg:p-8"
    >
      {/* The hero's wash, from the same tokens. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_0%_0%,var(--rm-wash-1),transparent_60%),radial-gradient(100%_80%_at_100%_100%,var(--rm-wash-2),transparent_60%)] opacity-80"
      />
      <header className="relative grid gap-1.5">
        <h2
          id="feature-previews-title"
          className="text-balance font-semibold text-2xl tracking-tight"
        >
          {t.heading}
        </h2>
        <p className="max-w-prose text-muted-foreground text-sm">{t.lede}</p>
      </header>

      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label={t.deviceLabel}
          value={picked.group}
          options={groups.map((value) => ({ value, label: t.groups[value] }))}
          onChange={(next) => {
            setGroup(next);
            setVariant(0);
          }}
        />
        <div className="flex flex-wrap gap-3">
          {variants && (
            <Segmented
              label={t.variantLabels[variantGroup]}
              value={String(variant) as '0' | '1'}
              options={[
                { value: '0', label: t.variants[variantGroup][0] },
                { value: '1', label: t.variants[variantGroup][1] },
              ]}
              onChange={(next) => setVariant(next === '1' ? 1 : 0)}
            />
          )}
          <Segmented
            label={t.themeLabel}
            value={theme}
            options={[
              { value: 'light', label: t.themes.light },
              { value: 'dark', label: t.themes.dark },
            ]}
            onChange={setTheme}
          />
        </div>
      </div>

      <div className="relative grid items-center gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="grid min-h-80 place-items-center">
          {ready ? (
            <picture key={image.avif}>
              <source srcSet={image.avif} type="image/avif" />
              <img
                src={image.webp}
                alt={alt}
                width={image.width}
                height={image.height}
                loading="lazy"
                decoding="async"
                draggable={false}
                className={`h-auto drop-shadow-xl ${size}`}
              />
            </picture>
          ) : (
            <span
              aria-hidden
              data-slot="skeleton"
              className={`block h-auto animate-pulse rounded-3xl bg-muted motion-reduce:animate-none ${skeletonWidth}`}
              style={skeletonStyle}
            />
          )}
        </div>
        <div className="grid content-center gap-3">
          {/* Only the feature is announced; device and theme switches are
              already announced by their toggles. */}
          <div className="grid gap-3" aria-live="polite">
            <h3 className="text-balance font-semibold text-xl">
              {feature.title[lang]}
            </h3>
            <p className="text-muted-foreground">{feature.body[lang]}</p>
          </div>
          <a
            href={`#track-${feature.track}`}
            className="w-fit font-medium text-sm underline underline-offset-4"
          >
            {t.onRoadmap}
          </a>
          <p className="text-muted-foreground text-xs">
            {fill(t.captured, { device, theme: t.themes[image.theme] })}
          </p>
        </div>
      </div>

      <ul
        aria-label={t.railLabel}
        className="relative -mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
      >
        {features.map((entry, position) => (
          <li
            key={`${entry.source}/${entry.id}`}
            className="shrink-0 snap-start"
          >
            <button
              type="button"
              aria-pressed={position === index}
              onClick={() => setIndex(position)}
              className="grid w-40 gap-0.5 rounded-xl border bg-card px-3 py-2 text-left outline-ring/50 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 aria-pressed:border-foreground motion-reduce:transition-none"
            >
              <span className="font-medium text-sm leading-snug">
                {entry.title[lang]}
              </span>
              <span className="text-muted-foreground text-xs">
                {entry.product}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
