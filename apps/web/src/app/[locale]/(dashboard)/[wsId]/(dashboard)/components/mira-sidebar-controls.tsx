'use client';
import { PanelLeft } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  type SidebarBehavior,
  SidebarContext,
} from '@tuturuuu/ui/custom/sidebar-context';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import { useContext } from 'react';
export function MiraSidebarControls() {
  const sidebar = useContext(SidebarContext);
  const t = useTranslations('settings.preferences');
  if (!sidebar) return null;
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={t('sidebar_behavior')}
            >
              <PanelLeft className="size-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{t('sidebar_behavior')}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={sidebar.behavior}
          onValueChange={(value) =>
            sidebar.handleBehaviorChange(value as SidebarBehavior)
          }
        >
          {(['expanded', 'collapsed', 'hover', 'hidden'] as const).map(
            (behavior) => (
              <DropdownMenuRadioItem key={behavior} value={behavior}>
                {t(`sidebar_${behavior}`)}
              </DropdownMenuRadioItem>
            )
          )}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
