'use client';

import { toast } from '@tuturuuu/ui/sonner';
import { useCallback, useMemo, useState } from 'react';
import { FocusCompleteDialog } from './components/focus/focus-complete-dialog';
import { FocusHistory } from './components/focus/focus-history';
// Existing components
import { FocusStartDialog } from './components/focus/focus-start-dialog';

// Overlay components
import {
  ActionBar,
  FloatingChatBubble,
  FocusModeOverlay,
  SidePanel,
  SlideOverPanel,
  StatsBar,
  type TunaMode,
} from './components/overlays';
import { AchievementsPanel } from './components/panels/achievements-panel';
import { CalendarPanel } from './components/panels/calendar-panel';
import { TasksPanel } from './components/panels/tasks-panel';
// Tank components
import { FullscreenTank } from './components/tank';
import { VoiceChatMode } from './components/voice/voice-chat-mode';
import {
  useCompleteFocusSession,
  useFocusSessions,
  useFocusTimer,
  useStartFocusSession,
} from './hooks/use-focus-session';
import { useFeedTuna, useTuna } from './hooks/use-tuna';

import type { TunaAchievement, TunaAnimationState } from './types/tuna';

interface TunaClientProps {
  wsId: string;
  isPersonal: boolean;
}

export default function TunaClient({ wsId, isPersonal }: TunaClientProps) {
  const { data: tunaData, isLoading: isPetLoading } = useTuna();
  useFocusSessions(); // Keep hook active for data caching
  const focusTimer = useFocusTimer();

  const feedMutation = useFeedTuna();
  const startFocusMutation = useStartFocusSession();
  const completeFocusMutation = useCompleteFocusSession();

  // Mode-based navigation instead of tabs
  const [activeMode, setActiveMode] = useState<TunaMode>('home');
  const [showStartFocusDialog, setShowStartFocusDialog] = useState(false);
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [completedSessionData, setCompletedSessionData] = useState<{
    xpEarned: number;
    achievements: TunaAchievement[];
  } | null>(null);
  const [chatMessage, setChatMessage] = useState<string | null>(null);
  const [animationState, setAnimationState] =
    useState<TunaAnimationState>('idle');
  const [isVoiceChatActive, setIsVoiceChatActive] = useState(false);

  const pet = tunaData?.pet;

  // Calculate animation state based on focus and mood
  const currentAnimationState = useMemo((): TunaAnimationState => {
    if (animationState !== 'idle') return animationState;
    if (focusTimer.isActive) return 'focused';
    if (!pet) return 'idle';

    switch (pet.mood) {
      case 'happy':
      case 'excited':
        return 'happy';
      case 'sad':
        return 'sad';
      case 'tired':
        return 'sleeping';
      case 'focused':
        return 'focused';
      default:
        return 'idle';
    }
  }, [animationState, focusTimer.isActive, pet]);

  // Trigger temporary animation
  const triggerAnimation = useCallback(
    (state: TunaAnimationState, duration = 2000) => {
      setAnimationState(state);
      setTimeout(() => setAnimationState('idle'), duration);
    },
    []
  );

  // Show chat message temporarily
  const showMessage = useCallback((message: string, duration = 3000) => {
    setChatMessage(message);
    setTimeout(() => setChatMessage(null), duration);
  }, []);

  // Handle feeding
  const handleFeed = useCallback(() => {
    feedMutation.mutate(undefined, {
      onSuccess: (data) => {
        triggerAnimation('eating', 1500);
        showMessage(data.message);
        toast.success(`Fed Tuna! +${data.xp_earned} XP`);
      },
      onError: (error) => {
        toast.error(error.message);
      },
    });
  }, [feedMutation, triggerAnimation, showMessage]);

  // Handle chat
  const handleChat = useCallback(() => {
    triggerAnimation('speaking', 2000);
    const messages = [
      "Hi there! How's your day going?",
      'Ready to be productive today?',
      "I'm here if you need to talk!",
      '*happy fish noises*',
      "Let's crush some goals together!",
    ] as const;
    const randomIndex = Math.floor(Math.random() * messages.length);
    showMessage(messages[randomIndex] ?? messages[0]);
  }, [triggerAnimation, showMessage]);

  // Handle pet action
  const handlePet = useCallback(() => {
    triggerAnimation('happy', 1500);
    showMessage('*happy wiggle* That feels nice!');
  }, [triggerAnimation, showMessage]);

  // Handle starting focus session
  const handleStartFocus = useCallback(
    (duration: number, goal?: string) => {
      startFocusMutation.mutate(
        { planned_duration: duration, goal },
        {
          onSuccess: () => {
            setShowStartFocusDialog(false);
            setActiveMode('focus');
            triggerAnimation('focused');
            showMessage("Let's focus! You've got this!");
            toast.success('Focus session started!');
          },
          onError: (error) => {
            toast.error(error.message);
          },
        }
      );
    },
    [startFocusMutation, triggerAnimation, showMessage]
  );

  // Handle completing focus session
  const handleCompleteFocus = useCallback(() => {
    if (!focusTimer.session) return;

    completeFocusMutation.mutate(
      { session_id: focusTimer.session.id },
      {
        onSuccess: (data) => {
          setCompletedSessionData({
            xpEarned: data.xp_earned,
            achievements: data.achievements_unlocked,
          });
          setShowCompleteDialog(true);
          triggerAnimation('celebrating', 3000);

          if (data.achievements_unlocked.length > 0) {
            showMessage('Achievement unlocked!');
          } else {
            showMessage('Great work! You did it!');
          }
        },
        onError: (error) => {
          toast.error(error.message);
        },
      }
    );
  }, [
    focusTimer.session,
    completeFocusMutation,
    triggerAnimation,
    showMessage,
  ]);

  // Handle closing complete dialog
  const handleCloseCompleteDialog = useCallback(() => {
    setShowCompleteDialog(false);
    setCompletedSessionData(null);
    setActiveMode('home');
  }, []);

  // Handle mode changes
  const handleModeChange = useCallback((mode: TunaMode) => {
    setActiveMode(mode);
  }, []);

  // Handle voice chat toggle
  const handleToggleVoiceChat = useCallback(() => {
    setIsVoiceChatActive((prev) => !prev);
  }, []);

  // Loading state
  if (isPetLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="h-32 w-32 animate-pulse rounded-full bg-gradient-to-br from-sky-200 to-blue-300" />
      </div>
    );
  }

  // Error state
  if (!pet) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <p className="text-muted-foreground">
          Failed to load Tuna. Please refresh.
        </p>
      </div>
    );
  }

  const isFocusMode = activeMode === 'focus' && focusTimer.isActive;

  return (
    <>
      {/* Layer 0: Fullscreen Tank (background) */}
      <FullscreenTank
        mood={pet.mood}
        animationState={currentAnimationState}
        isFocusMode={isFocusMode}
      />

      {/* Layer 30: Primary Overlays */}
      <StatsBar pet={pet} isFocusMode={isFocusMode} />

      <SidePanel pet={pet} isFocusMode={isFocusMode} />

      {/* Hide regular ActionBar when voice chat is active - VoiceChatMode replaces it */}
      {!isVoiceChatActive && (
        <ActionBar
          activeMode={activeMode}
          onModeChange={handleModeChange}
          onFeed={handleFeed}
          onChat={handleChat}
          onPet={handlePet}
          onStartFocus={() => setShowStartFocusDialog(true)}
          onTalk={handleToggleVoiceChat}
          isFeedingDisabled={feedMutation.isPending || pet.hunger >= 100}
          isFocusActive={focusTimer.isActive}
          isTalkActive={isVoiceChatActive}
        />
      )}

      {/* Layer 40: Focus Mode Overlay */}
      {isFocusMode && (
        <FocusModeOverlay
          isActive={focusTimer.isActive}
          elapsedSeconds={focusTimer.elapsedSeconds}
          remainingSeconds={focusTimer.remainingSeconds}
          progress={focusTimer.progress}
          isOvertime={focusTimer.isOvertime}
          goal={focusTimer.session?.goal}
          onComplete={handleCompleteFocus}
        />
      )}

      {/* Layer 50: Chat Bubble */}
      <FloatingChatBubble message={chatMessage} isVisible={!!chatMessage} />

      {/* Slide Panels */}
      <SlideOverPanel
        isOpen={activeMode === 'achievements'}
        onClose={() => setActiveMode('home')}
        title="Achievements"
      >
        <AchievementsPanel />
      </SlideOverPanel>

      <SlideOverPanel
        isOpen={activeMode === 'history'}
        onClose={() => setActiveMode('home')}
        title="Focus History"
      >
        <FocusHistory limit={20} />
      </SlideOverPanel>

      <SlideOverPanel
        isOpen={activeMode === 'tasks'}
        onClose={() => setActiveMode('home')}
        title="My Tasks"
      >
        <TasksPanel wsId={wsId} isPersonal={isPersonal} />
      </SlideOverPanel>

      <SlideOverPanel
        isOpen={activeMode === 'calendar'}
        onClose={() => setActiveMode('home')}
        title="Calendar"
      >
        <CalendarPanel wsId={wsId} />
      </SlideOverPanel>

      {/* Voice Chat Mode - Replaces ActionBar with voice-optimized controls */}
      <VoiceChatMode
        wsId={wsId}
        isOpen={isVoiceChatActive}
        onClose={() => setIsVoiceChatActive(false)}
        onAnimationChange={setAnimationState}
        onMessage={showMessage}
      />

      {/* Dialogs */}
      <FocusStartDialog
        open={showStartFocusDialog}
        onOpenChange={setShowStartFocusDialog}
        onStart={handleStartFocus}
        isLoading={startFocusMutation.isPending}
      />

      <FocusCompleteDialog
        open={showCompleteDialog}
        onOpenChange={handleCloseCompleteDialog}
        session={focusTimer.session ?? null}
        xpEarned={completedSessionData?.xpEarned ?? 0}
        achievementsUnlocked={completedSessionData?.achievements ?? []}
        onSubmit={handleCloseCompleteDialog}
        isLoading={completeFocusMutation.isPending}
      />
    </>
  );
}
