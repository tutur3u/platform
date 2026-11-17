import { ArrowDown, ArrowUp, CornerDownLeft } from '@tuturuuu/icons';
import { Kbd, KbdGroup } from '@tuturuuu/ui/kbd';
import type { ReactNode } from 'react';

function isApplePlatform() {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function Hint({ children, label }: { children: ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {children}
      <span>{label}</span>
    </span>
  );
}

/** Footer with the launcher key hints and a trailing slot for controls. */
export function AppsLauncherKeyboardHints({
  children,
  closeLabel,
  favoriteLabel,
  navigateLabel,
  openLabel,
}: {
  children?: ReactNode;
  closeLabel: string;
  favoriteLabel: string;
  navigateLabel: string;
  openLabel: string;
}) {
  return (
    <div
      className="flex shrink-0 items-center gap-4 border-t px-3 py-2 font-medium text-muted-foreground text-xs"
      data-slot="apps-launcher-keyboard-hints"
    >
      <div className="hidden flex-wrap items-center gap-4 sm:flex">
        <Hint label={navigateLabel}>
          <KbdGroup>
            <Kbd>
              <ArrowUp aria-hidden />
            </Kbd>
            <Kbd>
              <ArrowDown aria-hidden />
            </Kbd>
          </KbdGroup>
        </Hint>
        <Hint label={openLabel}>
          <Kbd>
            <CornerDownLeft aria-hidden />
          </Kbd>
        </Hint>
        <Hint label={favoriteLabel}>
          <Kbd>{isApplePlatform() ? '⌘S' : 'Ctrl+S'}</Kbd>
        </Hint>
        <Hint label={closeLabel}>
          <Kbd>Esc</Kbd>
        </Hint>
      </div>
      {children}
    </div>
  );
}
