'use client';

import { BadgeCheck } from '@tuturuuu/icons';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@tuturuuu/ui/hover-card';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { createPortal } from 'react-dom';

export function MiraAvatar({ size = 28 }: { size?: number }) {
  return (
    <Image
      src="/media/logos/nova/nova-transparent.png"
      width={size}
      height={size}
      alt=""
      className="shrink-0 object-contain"
    />
  );
}

export function MiraProfile({
  children,
  mention = false,
}: {
  children?: ReactNode;
  mention?: boolean;
}) {
  const t = useTranslations('meet.call');
  const [open, setOpen] = useState(false);
  return (
    <HoverCard
      open={open}
      onOpenChange={setOpen}
      openDelay={180}
      closeDelay={150}
    >
      <HoverCardTrigger asChild>
        <button
          type="button"
          aria-label={t('mira_profile')}
          aria-expanded={open}
          onClick={() => setOpen(true)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          className={
            mention
              ? 'inline rounded-md bg-primary/10 px-1 py-0.5 font-medium text-primary outline-none hover:bg-primary/20 focus-visible:ring-2 focus-visible:ring-ring'
              : 'inline-flex min-w-0 shrink-0 items-center gap-1.5 self-start rounded font-medium outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring'
          }
        >
          {children ??
            (mention ? (
              '@Tuturuuu'
            ) : (
              <>
                <span>Mira</span>
                <BadgeCheck
                  className="size-3.5 shrink-0 text-primary"
                  aria-label={t('official_assistant')}
                />
              </>
            ))}
        </button>
      </HoverCardTrigger>
      {open &&
        createPortal(
          <HoverCardContent
            className="w-72 rounded-2xl p-4"
            side="top"
            align="start"
          >
            <div className="flex items-center gap-3">
              <div className="grid size-12 place-items-center rounded-xl border bg-muted/30">
                <MiraAvatar size={40} />
              </div>
              <div>
                <p className="flex items-center gap-1.5 font-semibold">
                  Mira{' '}
                  <BadgeCheck
                    className="size-4 text-primary"
                    aria-label={t('official_assistant')}
                  />
                </p>
                <p className="text-muted-foreground text-xs">@Tuturuuu</p>
              </div>
            </div>
            <p className="mt-3 font-medium text-primary text-xs">
              {t('official_assistant')}
            </p>
            <p className="mt-1 text-pretty text-muted-foreground text-sm">
              {t('mira_profile_hint')}
            </p>
          </HoverCardContent>,
          document.body
        )}
    </HoverCard>
  );
}
