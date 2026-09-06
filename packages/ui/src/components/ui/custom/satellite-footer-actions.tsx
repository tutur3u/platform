'use client';

import { ArrowBigUpDash, MessageSquareWarning } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { type ReactNode, useCallback, useRef, useState } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../tooltip';
import { type SatelliteBrandProps, ShellAnchor } from './satellite-brand';

type FooterItem = 'upgrade' | 'discord' | 'feedback';

export interface SatelliteFooterActionsProps {
  labels: { upgrade: string; feedback: string };
  discordHref?: string;
  onFeedback: () => void;
  LinkComponent?: SatelliteBrandProps['LinkComponent'];
  wsId: string;
  isCollapsed: boolean;
  showUpgrade: boolean;
  upgradeHref?: string;
  upgradeExternal?: boolean;
}

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 -28.5 256 256"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid"
    >
      <title>Discord</title>
      <path
        d="M216.856339,16.5966031 C200.285002,8.84328665 182.566144,3.2084988 164.041564,0 C161.766523,4.11318106 159.108624,9.64549908 157.276099,14.0464379 C137.583995,11.0849896 118.072967,11.0849896 98.7430163,14.0464379 C96.9108417,9.64549908 94.1925838,4.11318106 91.8971895,0 C73.3526068,3.2084988 55.6133949,8.86399117 39.0420583,16.6376612 C5.61752293,67.146514 -3.4433191,116.400813 1.08711069,164.955721 C23.2560196,181.510915 44.7403634,191.567697 65.8621325,198.148576 C71.0772151,190.971126 75.7283628,183.341335 79.7352139,175.300261 C72.104019,172.400575 64.7949724,168.822202 57.8887866,164.667963 C59.7209612,163.310589 61.5131304,161.891452 63.2445898,160.431257 C105.36741,180.133187 151.134928,180.133187 192.754523,160.431257 C194.506336,161.891452 196.298154,163.310589 198.110326,164.667963 C191.183787,168.842556 183.854737,172.420929 176.223542,175.320965 C180.230393,183.341335 184.861538,190.991831 190.096624,198.16893 C211.238746,191.588051 232.743023,181.531619 254.911949,164.955721 C260.227747,108.668201 245.831087,59.8662432 216.856339,16.5966031 Z M85.4738752,135.09489 C72.8290281,135.09489 62.4592217,123.290155 62.4592217,108.914901 C62.4592217,94.5396472 72.607595,82.7145587 85.4738752,82.7145587 C98.3405064,82.7145587 108.709962,94.5189427 108.488529,108.914901 C108.508531,123.290155 98.3405064,135.09489 85.4738752,135.09489 Z M170.525237,135.09489 C157.88039,135.09489 147.510584,123.290155 147.510584,108.914901 C147.510584,94.5396472 157.658606,82.7145587 170.525237,82.7145587 C183.391518,82.7145587 193.761324,94.5189427 193.539891,108.914901 C193.539891,123.290155 183.391518,135.09489 170.525237,135.09489 Z"
        fill="currentColor"
        fillRule="nonzero"
      />
    </svg>
  );
}

export function SatelliteFooterActions({
  labels,
  discordHref,
  onFeedback,
  LinkComponent = ShellAnchor,
  wsId,
  isCollapsed,
  showUpgrade,
  upgradeHref,
  upgradeExternal = false,
}: SatelliteFooterActionsProps) {
  const [hoveredItem, setHoveredItem] = useState<FooterItem | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>(null);
  // After switching items, ignore mouse events until the CSS transition
  // finishes so layout shifts don't cause the cursor to "see" a different
  // item mid-animation and oscillate.
  const cooldownUntil = useRef(0);

  const hasDiscord = !!discordHref;

  const resolvedUpgradeHref = upgradeHref ?? `/${wsId}/billing`;

  const defaultExpanded: FooterItem = showUpgrade ? 'upgrade' : 'feedback';
  const activeExpanded = hoveredItem ?? defaultExpanded;

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }

    // Skip during cooldown -- transition is still running
    if (Date.now() < cooldownUntil.current) return;

    const target = (e.target as HTMLElement).closest('[data-item]');
    if (!target) return;

    const item = target.getAttribute('data-item') as FooterItem;
    setHoveredItem((prev) => {
      if (prev === item) return prev;
      // Lock out further changes for the transition duration (200ms + buffer)
      cooldownUntil.current = Date.now() + 250;
      return item;
    });
  }, []);

  const handleMouseLeave = useCallback(() => {
    leaveTimer.current = setTimeout(() => {
      cooldownUntil.current = Date.now() + 250;
      setHoveredItem(null);
    }, 100);
  }, []);

  // Collapsed: vertical stack of icon-only buttons
  if (isCollapsed) {
    return (
      <div className="flex w-full flex-col items-center gap-1">
        {showUpgrade && (
          <CollapsedItem
            LinkComponent={LinkComponent}
            href={resolvedUpgradeHref}
            external={upgradeExternal}
            tooltip={labels.upgrade}
            variant="upgrade"
          >
            <ArrowBigUpDash className="h-4.5 w-4.5" />
          </CollapsedItem>
        )}
        {hasDiscord && (
          <CollapsedItem
            LinkComponent={LinkComponent}
            href={discordHref!}
            external
            tooltip="Discord"
          >
            <DiscordIcon className="h-4.5 w-4.5" />
          </CollapsedItem>
        )}
        <CollapsedItem
          LinkComponent={LinkComponent}
          tooltip={labels.feedback}
          onClick={onFeedback}
        >
          <MessageSquareWarning className="h-4.5 w-4.5" />
        </CollapsedItem>
      </div>
    );
  }

  // Expanded sidebar: horizontal bar.
  // One item is "active" (expanded with label), others are icon-only.
  return (
    <div
      className="flex w-full items-center gap-1"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {showUpgrade && (
        <FooterAction
          LinkComponent={LinkComponent}
          id="upgrade"
          isActive={activeExpanded === 'upgrade'}
          label={labels.upgrade}
          href={resolvedUpgradeHref}
          external={upgradeExternal}
          variant="upgrade"
        >
          <ArrowBigUpDash className="h-4 w-4 shrink-0" />
        </FooterAction>
      )}
      {hasDiscord && (
        <FooterAction
          LinkComponent={LinkComponent}
          id="discord"
          isActive={activeExpanded === 'discord'}
          label="Discord"
          href={discordHref!}
          external
        >
          <DiscordIcon className="h-4 w-4 shrink-0" />
        </FooterAction>
      )}
      <FooterAction
        LinkComponent={LinkComponent}
        id="feedback"
        isActive={activeExpanded === 'feedback'}
        label={labels.feedback}
        onClick={onFeedback}
      >
        <MessageSquareWarning className="h-4 w-4 shrink-0" />
      </FooterAction>
    </div>
  );
}

// --- Sub-components ---

interface CollapsedItemProps {
  LinkComponent: NonNullable<SatelliteBrandProps['LinkComponent']>;
  children: ReactNode;
  tooltip: string;
  href?: string;
  external?: boolean;
  onClick?: () => void;
  variant?: 'upgrade' | 'default';
}

function CollapsedItem({
  LinkComponent: Link,
  children,
  tooltip,
  href,
  external,
  onClick,
  variant = 'default',
}: CollapsedItemProps) {
  const isUpgrade = variant === 'upgrade';

  const className = cn(
    'flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-150',
    isUpgrade
      ? [
          'group bg-linear-to-br from-dynamic-purple/10 to-dynamic-indigo/10',
          'border border-dynamic-purple/20 text-dynamic-purple',
          'hover:border-dynamic-purple/40 hover:from-dynamic-purple/15 hover:to-dynamic-indigo/15',
          'hover:[box-shadow:0_0_20px_-5px_oklch(var(--dynamic-purple)/0.3)]',
        ]
      : 'text-foreground/60 hover:bg-foreground/5 hover:text-foreground'
  );

  const wrappedChildren = isUpgrade ? (
    <span className="transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:scale-110">
      {children}
    </span>
  ) : (
    children
  );

  const content = href ? (
    external ? (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        aria-label={tooltip}
      >
        {wrappedChildren}
      </a>
    ) : (
      <Link href={href} className={className} aria-label={tooltip}>
        {wrappedChildren}
      </Link>
    )
  ) : (
    <button
      type="button"
      onClick={onClick}
      className={className}
      aria-label={tooltip}
    >
      {wrappedChildren}
    </button>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent side="right">
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}

interface FooterActionProps {
  LinkComponent: NonNullable<SatelliteBrandProps['LinkComponent']>;
  id: FooterItem;
  isActive: boolean;
  label: string;
  children: ReactNode;
  href?: string;
  external?: boolean;
  onClick?: () => void;
  variant?: 'upgrade' | 'default';
}

function FooterAction({
  LinkComponent: Link,
  id,
  isActive,
  label,
  children,
  href,
  external,
  onClick,
  variant = id === 'upgrade' ? 'upgrade' : 'default',
}: FooterActionProps) {
  const isUpgrade = variant === 'upgrade';

  const className = cn(
    'flex h-9 items-center justify-center gap-1.5 rounded-lg transition-all duration-200',
    isActive ? 'min-w-0 flex-1' : 'w-9 shrink-0',
    isUpgrade
      ? [
          'group relative overflow-hidden text-dynamic-purple',
          isActive
            ? [
                'border border-dynamic-purple/20 bg-linear-to-r from-dynamic-purple/10 to-dynamic-indigo/8',
                'hover:border-dynamic-purple/35 hover:[box-shadow:0_0_20px_-5px_oklch(var(--dynamic-purple)/0.3)]',
              ]
            : 'hover:bg-dynamic-purple/8 hover:[box-shadow:0_0_16px_-4px_oklch(var(--dynamic-purple)/0.2)]',
        ]
      : [
          isActive
            ? 'bg-foreground/5 text-foreground'
            : 'text-foreground/50 hover:bg-foreground/5 hover:text-foreground/70',
        ]
  );

  const inner = (
    <>
      <span
        className={cn(
          'shrink-0 transition-transform duration-200',
          isUpgrade && 'group-hover:scale-110'
        )}
      >
        {children}
      </span>
      {isActive && (
        <span className="truncate font-medium text-sm">{label}</span>
      )}
      {isUpgrade && isActive && (
        <span
          className="pointer-events-none absolute inset-0 animate-[shimmer_4s_ease-in-out_infinite]"
          style={{
            background:
              'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.12) 50%, transparent 60%)',
          }}
        />
      )}
    </>
  );

  // data-item is read by the container's onMouseMove for flicker-free tracking
  const sharedProps = {
    className,
    'data-item': id,
    'aria-label': label,
  } as const;

  if (href) {
    return external ? (
      <a href={href} target="_blank" rel="noopener noreferrer" {...sharedProps}>
        {inner}
      </a>
    ) : (
      <Link href={href} {...sharedProps}>
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} {...sharedProps}>
      {inner}
    </button>
  );
}
