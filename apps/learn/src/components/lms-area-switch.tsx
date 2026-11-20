'use client';

import { GraduationCap } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';

export function LmsAreaSwitchLink({ href }: { href: string | null }) {
  const t = useTranslations('navigation');
  if (!href) return null;
  const label = t('switchToTeach');

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          asChild
          className="size-8 shrink-0 text-muted-foreground shadow-none hover:text-foreground"
          size="icon"
          variant="ghost"
        >
          <a aria-label={label} href={href}>
            <GraduationCap aria-hidden className="size-4" />
          </a>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
