'use client';

import { ExternalLink } from '@tuturuuu/icons';
import {
  toSafeUpskiiUrl,
  type UpskiiPresentation,
} from '@tuturuuu/realtime/meet/room-upskii-presentation';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { QRCodeSVG } from 'qrcode.react';
import type { ReactNode } from 'react';
import { displayUpskiiLink } from './upskii-list-state';

/**
 * The presented item, readable from the back of a room and on a phone: a
 * large title, a QR code and one link. The link is checked against the pinned
 * Upskii origin once more before it is rendered, so nothing else is opened.
 */
export function UpskiiPresentingView({
  presentation,
  actions,
}: {
  presentation: UpskiiPresentation;
  /** The presenter's controls; absent for everyone else. */
  actions?: ReactNode;
}) {
  const t = useTranslations('meet.call.upskii');
  const { item } = presentation;
  const url = toSafeUpskiiUrl(item.url);
  const assessment = item.kind === 'assessment';

  return (
    <article className="@container flex flex-1 flex-col items-center justify-center gap-6 py-4 text-center">
      <header className="flex max-w-3xl flex-col gap-2">
        <p className="font-medium text-muted-foreground text-sm @lg:text-base">
          {assessment ? t('kind_assessment') : t('kind_lesson')}
          {item.classTitle ? ` · ${item.classTitle}` : ''}
        </p>
        <h2 className="text-balance font-semibold text-2xl leading-tight @lg:text-4xl @3xl:text-5xl">
          {item.title}
        </h2>
      </header>
      {url ? (
        <>
          {/* QR codes scan reliably only as dark on light, so the code
              keeps black on white in both themes. */}
          <figure className="grid justify-items-center gap-2">
            <div className="rounded-2xl bg-white p-3 text-black">
              <QRCodeSVG
                value={url}
                size={192}
                level="M"
                marginSize={1}
                title={t('qr_label', { title: item.title })}
                className="size-40 @lg:size-56"
              />
            </div>
            <figcaption className="text-muted-foreground text-sm">
              {assessment ? t('scan_assessment') : t('scan_lesson')}
              <span className="block break-all font-mono text-xs">
                {displayUpskiiLink(url)}
              </span>
            </figcaption>
          </figure>
          <Button asChild size="lg" className="rounded-full">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
            >
              <ExternalLink className="size-4" />
              {t('open')}
            </a>
          </Button>
        </>
      ) : (
        <p className="text-muted-foreground text-sm">{t('link_unavailable')}</p>
      )}
      {actions && (
        <div className="flex flex-wrap justify-center gap-2">{actions}</div>
      )}
    </article>
  );
}
