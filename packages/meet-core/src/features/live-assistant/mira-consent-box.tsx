'use client';

import { ExternalLink, Info, UserRoundCheck } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Label } from '@tuturuuu/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';

/**
 * Whether a ticked Mira box also records the participant's live transcript
 * Allow. The box covers notes, captions and the live transcript; turning this
 * off makes the transcript need its own explicit Allow.
 */
export const MIRA_BOX_RECORDS_TRANSCRIPT = true;

const LINKS = {
  privacy: 'https://tuturuuu.com/privacy',
  terms: 'https://tuturuuu.com/terms',
  ai: 'https://tuturuuu.com/ai',
} as const;

/** Info keys shown beside the box, in order; every one is required content. */
export const MIRA_CONSENT_INFO_KEYS = [
  'info_what',
  'info_controller',
  'info_data',
  'info_readers',
  'info_retention',
  'info_limits',
  'info_sensitive',
  'info_off',
] as const;

/** The exact notice text a participant sees, hashed into their choice. */
export function useMiraConsentText() {
  const t = useTranslations('meet.mira_consent');
  return [
    t('box_label'),
    t('adults'),
    ...MIRA_CONSENT_INFO_KEYS.map((key) => t(key)),
  ].join('\n');
}

/** SHA-256 hex of the shown notice text. */
export async function hashMiraConsentText(text: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text)
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function MiraConsentInfo() {
  const t = useTranslations('meet.mira_consent');
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 pointer-coarse:size-11"
          aria-label={t('info_button')}
        >
          <Info aria-hidden className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        collisionPadding={12}
        className="max-h-[min(28rem,var(--radix-popover-content-available-height))] w-[min(22rem,calc(100vw-1.5rem))] space-y-2 overflow-y-auto text-sm"
      >
        <p className="font-medium">{t('info_title')}</p>
        {MIRA_CONSENT_INFO_KEYS.map((key) => (
          <p key={key} className="text-pretty text-muted-foreground text-xs">
            {t(key)}
          </p>
        ))}
        <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-xs">
          {(['privacy', 'terms', 'ai'] as const).map((link) => (
            <a
              key={link}
              className="inline-flex items-center gap-1 underline underline-offset-2"
              href={LINKS[link]}
              target="_blank"
              rel="noreferrer"
            >
              {t(`link_${link}`)}
              <ExternalLink aria-hidden className="size-3" />
            </a>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The single Mira consent tick box with its info panel and 18+ line. The
 * caller owns the checked state; ticked turns Mira on for this participant,
 * unticked keeps Mira off for them.
 */
export function MiraConsentBox({
  id,
  checked,
  onCheckedChange,
  disabled,
  className,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  const t = useTranslations('meet.mira_consent');
  return (
    <div className={cn('space-y-2 rounded-xl border p-3', className)}>
      <div className="flex items-start gap-3">
        <Checkbox
          id={id}
          checked={checked}
          disabled={disabled}
          onCheckedChange={(value) => onCheckedChange(value === true)}
          aria-describedby={`${id}-adults`}
          className="mt-0.5"
        />
        <Label
          htmlFor={id}
          className="min-w-0 flex-1 text-pretty font-normal text-sm leading-snug"
        >
          {t('box_label')}
        </Label>
        <MiraConsentInfo />
      </div>
      <p
        id={`${id}-adults`}
        className="flex items-start gap-1.5 text-pretty text-muted-foreground text-xs"
      >
        <UserRoundCheck aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        {t('adults')}
      </p>
    </div>
  );
}
