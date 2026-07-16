'use client';

import { BookOpen, ExternalLink, ShieldCheck } from '@tuturuuu/icons';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { SquareFirstPaymentDialog } from './square-production-launch-dialog';

const SUPPORT_LINKS = {
  pairing:
    'https://developer.squareup.com/docs/terminal-api/integrate-square-terminal',
  setup: 'https://squareup.com/help/us/en/article/6535-set-up-square-terminal',
  network:
    'https://squareup.com/help/us/en/article/8348-set-up-network-requirements-for-square-hardware',
  tuturuuu:
    'https://docs.tuturuuu.com/platform/applications/inventory-square-pos',
} as const;

const sections = ['prepare', 'pair', 'activate', 'verify', 'recover'] as const;

export function SquareProductionLaunchDetails({
  setupReady,
}: {
  setupReady: boolean;
}) {
  const t = useTranslations('inventory.operator.square.guide.launch');

  return (
    <div className="grid gap-5 border-border border-t p-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <Accordion
        className="border-border border-t"
        collapsible
        defaultValue="prepare"
        type="single"
      >
        {sections.map((section, index) => (
          <AccordionItem key={section} value={section}>
            <AccordionTrigger className="gap-3 py-4 hover:no-underline">
              <span className="flex min-w-0 items-center gap-3">
                <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40 font-mono text-xs">
                  {index + 1}
                </span>
                <span>{t(`details.${section}.title`)}</span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="pl-9">
              <ul className="grid gap-2 text-muted-foreground text-sm leading-6">
                {(['one', 'two', 'three'] as const).map((item) => (
                  <li className="flex gap-2" key={item}>
                    <span
                      aria-hidden
                      className="mt-2 size-1.5 shrink-0 rounded-full bg-primary"
                    />
                    <span>{t(`details.${section}.${item}`)}</span>
                  </li>
                ))}
              </ul>
              {section === 'pair' ? (
                <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm leading-6">
                  {t('pairingWarning')}
                </div>
              ) : null}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      <aside className="grid h-fit gap-4">
        <div className="rounded-lg border border-border bg-muted/20 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-sm">{t('firstSale.title')}</p>
            <Badge variant={setupReady ? 'default' : 'secondary'}>
              {setupReady ? t('status.ready') : t('status.blocked')}
            </Badge>
          </div>
          <p className="mt-2 text-muted-foreground text-sm leading-6">
            {setupReady
              ? t('firstSale.readyDescription')
              : t('firstSale.blockedDescription')}
          </p>
          <div className="mt-4">
            <SquareFirstPaymentDialog disabled={!setupReady} fullWidth />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <BookOpen className="size-4 text-primary" />
            <p className="font-semibold text-sm">{t('links.title')}</p>
          </div>
          <div className="mt-3 grid gap-1.5">
            {(['tuturuuu', 'setup', 'pairing', 'network'] as const).map(
              (link) => (
                <Button
                  asChild
                  className="h-auto justify-between whitespace-normal px-3 py-2 text-left"
                  key={link}
                  size="sm"
                  variant="ghost"
                >
                  <a
                    href={SUPPORT_LINKS[link]}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <span>{t(`links.${link}`)}</span>
                    <ExternalLink className="size-3.5 shrink-0" />
                  </a>
                </Button>
              )
            )}
          </div>
        </div>

        <div className="flex gap-3 rounded-lg border border-border bg-muted/20 p-4 text-muted-foreground text-xs leading-5">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>{t('onlineRequirement')}</span>
        </div>
      </aside>
    </div>
  );
}
