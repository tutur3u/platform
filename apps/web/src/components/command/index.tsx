'use client';

import { CommandDialog } from '@tuturuuu/ui/command';
import { resolveWorkspaceId } from '@tuturuuu/utils/constants';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import type { NavLink } from '@/components/navigation';
import './command-palette.css';
import { CommandMode } from './modes/command-mode';

// Main Command Palette Component
type CommandPaletteProps = {
  open: boolean;
  // Preferred prop for open change function to satisfy lint rule
  setOpenAction?: React.Dispatch<React.SetStateAction<boolean>>;
  // Navigation links for command mode (optional)
  navLinks?: (NavLink | null)[];
};
type LegacyProps = {
  // Back-compat props some parents may still pass
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  action?: React.Dispatch<React.SetStateAction<boolean>>;
};

export function CommandPalette(props: CommandPaletteProps & LegacyProps) {
  const t = useTranslations('command_palette');
  const { open } = props;
  const setOpenAction = React.useCallback<
    React.Dispatch<React.SetStateAction<boolean>>
  >(
    (value) => {
      if (props.setOpenAction) return props.setOpenAction(value);
      if (props.setOpen) return props.setOpen(value);
      if (props.action) return props.action(value);
    },
    [props]
  );

  const params = useParams();
  const { wsId } = params;

  // Resolve workspace ID from URL params (handles special slugs like "internal")
  const workspaceId = React.useMemo(() => {
    if (wsId && typeof wsId === 'string' && wsId !== 'undefined') {
      return resolveWorkspaceId(wsId);
    }
    return null;
  }, [wsId]);

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (
        !e.repeat &&
        e.key.toLowerCase() === 'k' &&
        (e.metaKey || e.ctrlKey)
      ) {
        e.preventDefault();
        e.stopPropagation();
        setOpenAction((currentOpen: boolean) => !currentOpen);
      }
    };

    document.addEventListener('keydown', down, { capture: true });
    return () =>
      document.removeEventListener('keydown', down, { capture: true });
  }, [setOpenAction]);

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpenAction}
      showCloseButton={false}
      title={t('title')}
      description={t('description')}
      commandProps={{ loop: true, shouldFilter: false }}
      contentClassName="command-palette-enter w-[min(96vw,1120px)] border-border/70 bg-background/95 shadow-2xl backdrop-blur-xl sm:max-w-5xl"
    >
      <CommandMode
        wsId={workspaceId}
        navLinks={props.navLinks || []}
        onClose={() => setOpenAction(false)}
      />
    </CommandDialog>
  );
}
