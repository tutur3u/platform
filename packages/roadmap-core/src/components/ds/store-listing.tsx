import { ToggleGroup, ToggleGroupItem } from '@tuturuuu/ui/toggle-group';
import { useRef, useState } from 'react';
import type { Lang, Messages } from '../shared';
import { CopyButton } from './copy-button';
import type { Store } from './store-data';

/** A titled block inside a dialog panel. */
export function PanelBox({
  title,
  children,
  className = '',
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`grid min-w-0 gap-3 rounded-xl border bg-card p-4 ${className}`}
    >
      {title && (
        <h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
          {title}
        </h3>
      )}
      {children}
    </section>
  );
}

export function Chips({ items }: { items: readonly string[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <li key={item} className="rounded-full bg-muted px-2.5 py-0.5 text-sm">
          {item}
        </li>
      ))}
    </ul>
  );
}

/**
 * The store listing as the store shows it: name and subtitle, promotional
 * text, the full description with a copy button, keywords and features. It
 * opens in the page's language; either listing language can be read.
 */
export function StoreListingPanel({
  store,
  lang,
  t,
}: {
  store: Store;
  lang: Lang;
  t: Messages['storeReleases'];
}) {
  const [shown, setShown] = useState<Lang>(lang);
  const description = useRef<HTMLDivElement>(null);
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-0.5" lang={shown}>
          <p className="font-semibold text-lg">{store.title[shown]}</p>
          {store.subtitle && (
            <p className="max-w-prose text-muted-foreground text-sm">
              {store.subtitle[shown]}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            value={shown}
            aria-label={t.listingLanguage}
            onValueChange={(next) => {
              if (next === 'en' || next === 'vi') setShown(next);
            }}
          >
            {store.languages.map((code) => (
              <ToggleGroupItem key={code} value={code} className="px-3">
                {t.locales[code]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <CopyButton
            text={() => store.description[shown]}
            source={description}
            label={t.copyListing}
            done={t.copied}
            failed={t.copyFailed}
          />
        </div>
      </div>
      {store.promotion && (
        <PanelBox title={t.promotion}>
          <p className="max-w-prose text-sm" lang={shown}>
            {store.promotion[shown]}
          </p>
        </PanelBox>
      )}
      <PanelBox title={t.listing}>
        <div
          ref={description}
          lang={shown}
          className="max-w-prose whitespace-pre-line text-sm leading-relaxed"
        >
          {store.description[shown]}
        </div>
      </PanelBox>
      {store.features.length > 0 && (
        <PanelBox title={t.features}>
          <ul className="grid list-disc gap-1 ps-5 text-sm" lang={shown}>
            {store.features.map((feature) => (
              <li key={feature.en}>{feature[shown]}</li>
            ))}
          </ul>
        </PanelBox>
      )}
      {store.keywords[shown].length > 0 && (
        <PanelBox title={t.keywords}>
          <Chips items={store.keywords[shown]} />
        </PanelBox>
      )}
    </div>
  );
}
