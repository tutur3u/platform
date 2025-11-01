'use client';

import { Check, Moon, Sun } from '@tuturuuu/icons';
import { CommandGroup, CommandItem } from '@tuturuuu/ui/command';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';

interface QuickActionsSectionProps {
  query: string;
  onSelect?: () => void;
}

export function QuickActionsSection({
  query,
  onSelect,
}: QuickActionsSectionProps) {
  const tCommon = useTranslations('common');
  const tCommand = useTranslations('command_palette');
  const { resolvedTheme, setTheme } = useTheme();

  // Only show when there's no query (in recent/default view)
  if (query.trim()) {
    return null;
  }

  const handleThemeToggle = () => {
    const newTheme = resolvedTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    onSelect?.();
  };

  const currentThemeLabel =
    resolvedTheme === 'dark' ? tCommon('dark') : tCommon('light');
  const nextThemeLabel =
    resolvedTheme === 'dark' ? tCommon('light') : tCommon('dark');

  return (
    <CommandGroup heading={tCommand('quick_actions')}>
      <CommandItem
        value="toggle-theme"
        onSelect={handleThemeToggle}
        className="flex items-center gap-3"
      >
        {/* Icon */}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
          {resolvedTheme === 'dark' ? (
            <Moon className="h-4 w-4 text-dynamic-purple" />
          ) : (
            <Sun className="h-4 w-4 text-dynamic-yellow" />
          )}
        </div>

        {/* Content */}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium">
            {tCommon('switch_to', { theme: nextThemeLabel })}
          </span>
          <span className="truncate text-muted-foreground text-xs">
            {tCommand('current_theme')}: {currentThemeLabel}
          </span>
        </div>

        {/* Check icon if needed */}
        <Check className="h-4 w-4 shrink-0 text-muted-foreground opacity-0" />
      </CommandItem>
    </CommandGroup>
  );
}
