import { Check } from '@tuturuuu/icons';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import type { Lang, Messages } from '../shared';
import { StoreGallery } from './store-gallery';
import type { Store } from './store-data';

const FIELDS = [
  'targetSubmitDate',
  'submittedAt',
  'approvedAt',
  'targetLiveDate',
  'liveAt',
] as const;

const BADGE: Record<
  string,
  'success' | 'warning' | 'error' | 'secondary' | 'outline'
> = {
  live: 'success',
  approved: 'success',
  submitted: 'warning',
  in_review: 'warning',
  rejected: 'error',
  preparing: 'secondary',
  planned: 'outline',
};

/** One store: release status, the five dates as a progression, screenshots and the listing. */
export function StoreCard({
  store,
  lang,
  t,
}: {
  store: Store;
  lang: Lang;
  t: Messages['storeReleases'];
}) {
  const { release } = store;
  const statuses = t.statuses as Record<string, string>;
  const date = new Intl.DateTimeFormat(lang, {
    dateStyle: 'medium',
    timeZone: 'Asia/Ho_Chi_Minh',
  });
  return (
    <Card
      role="region"
      aria-labelledby={`store-${store.id}`}
      className="min-w-0 overflow-hidden"
    >
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2 p-4 pb-3 sm:p-5 sm:pb-3">
        <div className="grid gap-1">
          <CardTitle
            id={`store-${store.id}`}
            role="heading"
            aria-level={3}
            className="text-base"
          >
            {store.name}
          </CardTitle>
          <p className="text-muted-foreground text-sm">
            {store.platform} · {release.version} ({t.build} {release.build})
          </p>
        </div>
        <Badge variant={BADGE[release.status] ?? 'secondary'}>
          {statuses[release.status] ?? t.pending}
        </Badge>
      </CardHeader>
      <CardContent className="grid grid-cols-[minmax(0,1fr)] gap-4 p-4 pt-0 sm:p-5 sm:pt-0">
        <ol className="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-3 xl:grid-cols-5">
          {FIELDS.map((field) => {
            const value = release[field];
            // A target date is a plan; the others are things that happened.
            const reached = Boolean(value) && !field.startsWith('target');
            return (
              <li key={field} className="grid gap-0.5 text-sm">
                <span
                  className={`flex items-center gap-1 text-xs ${reached ? 'text-foreground' : 'text-muted-foreground'}`}
                >
                  {reached && <Check size={12} aria-hidden />}
                  {t.dates[field]}
                </span>
                {value ? (
                  <time dateTime={value} className="tabular-nums">
                    {date.format(new Date(value))}
                  </time>
                ) : (
                  <span className="text-muted-foreground">{t.pending}</span>
                )}
              </li>
            );
          })}
        </ol>
        <StoreGallery store={store} lang={lang} t={t} />
        <Accordion type="single" collapsible>
          <AccordionItem value="listing" className="border-b-0">
            <AccordionTrigger className="py-2 text-sm">
              {t.listing} · {store.title[lang]}
            </AccordionTrigger>
            <AccordionContent className="whitespace-pre-line text-muted-foreground text-sm">
              {store.description[lang]}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}
