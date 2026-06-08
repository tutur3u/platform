'use client';

import { cn } from '@tuturuuu/utils/format';
import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import { useEffect, useState } from 'react';
import { useMiraSoul } from '../hooks/use-mira-soul';
import type { MiraChatPanelProps } from './mira-chat-panel';
import type { MiraDashboardClientProps } from './mira-dashboard-client-types';

const MiraWorkspaceContextSelector = dynamic(
  () =>
    import('./mira-workspace-context-selector').then(
      (module) => module.MiraWorkspaceContextSelector
    ),
  {
    ssr: false,
    loading: () => (
      <div className="h-8 w-28 animate-pulse rounded-md bg-foreground/5" />
    ),
  }
);

function MiraChatPanelLoading() {
  return (
    <div className="flex min-h-0 flex-1 animate-pulse flex-col rounded-lg bg-foreground/5" />
  );
}

function useMiraChatPanelComponent() {
  const [MiraChatPanel, setMiraChatPanel] =
    useState<ComponentType<MiraChatPanelProps> | null>(null);

  useEffect(() => {
    let active = true;

    void import('./mira-chat-panel').then((module) => {
      if (active) setMiraChatPanel(() => module.default);
    });

    return () => {
      active = false;
    };
  }, []);

  return MiraChatPanel;
}

function FullscreenGradientBg() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* Blob 1 — top-left, purple-indigo */}
      <div
        className="absolute -top-32 -left-32 h-150 w-150 animate-[mira-blob_18s_ease-in-out_infinite] rounded-full opacity-[0.12] blur-[120px] dark:opacity-[0.07]"
        style={{
          background:
            'radial-gradient(circle, var(--color-dynamic-purple) 0%, var(--color-dynamic-indigo) 100%)',
        }}
      />
      {/* Blob 2 — bottom-right, cyan-blue */}
      <div
        className="absolute -right-40 -bottom-40 h-125 w-125 animate-[mira-blob_22s_ease-in-out_infinite_reverse] rounded-full opacity-[0.10] blur-[100px] dark:opacity-[0.06]"
        style={{
          background:
            'radial-gradient(circle, var(--color-dynamic-cyan) 0%, var(--color-dynamic-blue) 100%)',
        }}
      />
      {/* Blob 3 — center-right, pink-rose */}
      <div
        className="absolute top-1/3 right-1/4 h-100 w-100 animate-[mira-blob_15s_ease-in-out_2s_infinite] rounded-full opacity-[0.08] blur-[90px] dark:opacity-[0.05]"
        style={{
          background:
            'radial-gradient(circle, var(--color-dynamic-pink) 0%, var(--color-dynamic-rose) 100%)',
        }}
      />
    </div>
  );
}

export default function MiraDashboardClientImpl({
  currentUser,
  initialAssistantName,
  wsId,
  children,
}: MiraDashboardClientProps) {
  const { data: soul } = useMiraSoul();
  const assistantName = soul?.name ?? initialAssistantName;
  const MiraChatPanel = useMiraChatPanelComponent();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [chatPanelResetKey, setChatPanelResetKey] = useState(0);

  return (
    <div
      className={cn(
        'relative flex flex-col overflow-hidden',
        isFullscreen
          ? 'fixed inset-0 z-50 bg-background p-3 sm:p-4'
          : 'h-[calc(100vh-5rem)] min-h-0 md:h-[calc(100vh-2rem)]'
      )}
    >
      {/* Animated gradient backdrop in fullscreen */}
      {isFullscreen && <FullscreenGradientBg />}

      {/* Main layout: semi-fullscreen chat with an in-panel insight dock */}
      <div
        className={cn(
          'relative z-10 flex min-h-0 min-w-0 flex-1 flex-col gap-3 sm:gap-4',
          !isFullscreen && 'xl:h-full'
        )}
      >
        {/* Chat panel — hero element with desktop overlay slot for compact widgets */}
        <div
          className={cn(
            'relative flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden rounded-xl border p-3 pb-0 shadow-sm backdrop-blur-sm sm:p-4',
            isFullscreen
              ? 'border-border/30 bg-card/40'
              : 'border-border/60 bg-card/50'
          )}
        >
          {MiraChatPanel ? (
            <MiraChatPanel
              key={`${wsId}-${chatPanelResetKey}`}
              wsId={wsId}
              assistantName={assistantName}
              userName={
                currentUser.display_name ||
                currentUser.full_name ||
                currentUser.email ||
                undefined
              }
              userAvatarUrl={currentUser.avatar_url}
              isFullscreen={isFullscreen}
              insightsDock={!isFullscreen ? children : undefined}
              onToggleFullscreen={() => setIsFullscreen((prev) => !prev)}
              onResetPanelState={() =>
                setChatPanelResetKey((current) => current + 1)
              }
              workspaceContextBadge={
                <MiraWorkspaceContextSelector wsId={wsId} />
              }
            />
          ) : (
            <MiraChatPanelLoading />
          )}
        </div>
      </div>
    </div>
  );
}
