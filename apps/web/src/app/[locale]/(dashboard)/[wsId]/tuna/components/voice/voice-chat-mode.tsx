'use client';

import { MessageSquare, Mic, PhoneOff, Sparkles } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { cn } from '@tuturuuu/utils/format';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioRecorder } from '@/app/[locale]/(dashboard)/[wsId]/(dashboard)/assistant/audio/audio-recorder';
import {
  type ConnectionStatus,
  LiveAPIProvider,
  useLiveAPIContext,
} from '@/hooks/use-live-api';
import { useTunaToken } from '../../hooks/use-tuna-token';
import type { TunaAnimationState } from '../../types/tuna';

interface VoiceChatModeProps {
  wsId: string;
  isOpen: boolean;
  onClose: () => void;
  onAnimationChange?: (state: TunaAnimationState) => void;
  onMessage?: (message: string) => void;
}

function useAudioRecorder() {
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const recorderRef = useRef<AudioRecorder | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      recorderRef.current = new AudioRecorder();
      return () => {
        recorderRef.current?.stop();
      };
    }
  }, []);

  useEffect(() => {
    const recorder = recorderRef.current;
    if (!recorder) return;

    const handleVolume = (volume: number) => {
      setIsUserSpeaking(volume > 0.1);
    };

    recorder.on('volume', handleVolume);
    return () => {
      recorder.off('volume', handleVolume);
    };
  }, []);

  return { isUserSpeaking, recorder: recorderRef.current };
}

// Compact voice status indicator for action bar
function VoiceStatusBadge({
  connectionStatus,
  isUserSpeaking,
  isSpeaking,
  volume,
}: {
  connectionStatus: ConnectionStatus;
  isUserSpeaking: boolean;
  isSpeaking: boolean;
  volume: number;
}) {
  const t = useTranslations('tuna.voice');

  const getStatus = () => {
    if (connectionStatus === 'connecting') return t('status.connecting');
    if (connectionStatus === 'reconnecting') return t('status.reconnecting');
    if (isUserSpeaking) return t('status.listening');
    if (isSpeaking) return t('status.tuna_speaking');
    return t('status.ready');
  };

  return (
    <motion.div
      className="flex items-center gap-2"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      {/* Voice activity indicator */}
      <div className="relative">
        {(isSpeaking || isUserSpeaking) && (
          <motion.div
            className={cn(
              'absolute inset-0 rounded-full',
              isSpeaking ? 'bg-dynamic-purple/40' : 'bg-dynamic-green/40'
            )}
            animate={{ scale: [1, 1.4, 1], opacity: [0.6, 0.2, 0.6] }}
            transition={{ duration: 1, repeat: Infinity }}
          />
        )}
        <motion.div
          className={cn(
            'relative flex h-8 w-8 items-center justify-center rounded-full',
            isSpeaking
              ? 'bg-dynamic-purple/20'
              : isUserSpeaking
                ? 'bg-dynamic-green/20'
                : 'bg-muted/50'
          )}
          animate={{ scale: 1 + volume * 0.2 }}
          transition={{ type: 'spring', stiffness: 300 }}
        >
          {isSpeaking ? (
            <Sparkles className="h-4 w-4 text-dynamic-purple" />
          ) : (
            <Mic
              className={cn(
                'h-4 w-4',
                isUserSpeaking ? 'text-dynamic-green' : 'text-muted-foreground'
              )}
            />
          )}
        </motion.div>
      </div>

      {/* Status text */}
      <span className="hidden text-sm sm:inline">{getStatus()}</span>
    </motion.div>
  );
}

// Voice mode action bar - replaces regular action bar when voice chat is active
function VoiceModeActionBar({
  onClose,
  onAnimationChange,
  onMessage,
}: Omit<VoiceChatModeProps, 'wsId' | 'isOpen'>) {
  const t = useTranslations('tuna.voice');
  const { client, connected, connectionStatus, connect, disconnect, volume } =
    useLiveAPIContext();
  const { isUserSpeaking } = useAudioRecorder();
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);
  const [textInput, setTextInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-connect when mounted
  useEffect(() => {
    if (!connected && connectionStatus === 'disconnected') {
      connect();
    }
  }, [connected, connectionStatus, connect]);

  // Update animation state based on voice activity
  // Idle when not speaking/listening so fish naturally swims
  useEffect(() => {
    if (isSpeaking) {
      onAnimationChange?.('speaking');
    } else if (isUserSpeaking) {
      onAnimationChange?.('listening');
    } else {
      // When idle in voice mode, let fish swim naturally
      onAnimationChange?.('idle');
    }
  }, [isSpeaking, isUserSpeaking, onAnimationChange]);

  // Listen for AI events
  useEffect(() => {
    if (!client) return;

    const handleAudio = () => setIsSpeaking(true);
    const handleTurnComplete = () => setIsSpeaking(false);
    const handleTranscription = (text: string) => {
      if (text && onMessage) {
        onMessage(text);
      }
    };

    client.on('audio', handleAudio);
    client.on('turncomplete', handleTurnComplete);
    client.on('transcription', handleTranscription);

    return () => {
      client.off('audio', handleAudio);
      client.off('turncomplete', handleTurnComplete);
      client.off('transcription', handleTranscription);
    };
  }, [client, onMessage]);

  const handleEndCall = useCallback(async () => {
    await disconnect();
    onAnimationChange?.('idle');
    onClose();
  }, [disconnect, onAnimationChange, onClose]);

  const handleTextSubmit = useCallback(() => {
    if (textInput.trim() && client && connected) {
      client.send({ text: textInput.trim() }, true);
      setTextInput('');
      inputRef.current?.focus();
    }
  }, [client, connected, textInput]);

  return (
    <motion.div
      className={cn(
        'fixed right-0 bottom-0 left-0 z-30',
        'mx-2 mb-2 md:mx-4 md:mb-4',
        'flex justify-center'
      )}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.3 }}
    >
      <div
        className={cn(
          'w-full max-w-md rounded-2xl border border-border/30',
          'bg-background/70 backdrop-blur-lg',
          'shadow-xl',
          'overflow-hidden'
        )}
      >
        {/* Text input section (expandable) */}
        <AnimatePresence>
          {showTextInput && (
            <motion.div
              className="flex gap-2 border-border/30 border-b p-3"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
            >
              <Input
                ref={inputRef}
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={t('type_message')}
                className="h-9 flex-1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleTextSubmit();
                  }
                }}
                disabled={!connected}
              />
              <Button
                size="sm"
                onClick={handleTextSubmit}
                disabled={!connected || !textInput.trim()}
              >
                {t('send_message')}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main controls */}
        <div className="flex items-center justify-between gap-3 p-3">
          {/* Voice status */}
          <VoiceStatusBadge
            connectionStatus={connectionStatus}
            isUserSpeaking={isUserSpeaking}
            isSpeaking={isSpeaking}
            volume={volume}
          />

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {/* Toggle text input */}
            <Button
              variant={showTextInput ? 'secondary' : 'ghost'}
              size="icon"
              className="h-9 w-9"
              onClick={() => setShowTextInput((prev) => !prev)}
              aria-label={t('toggle_text_chat')}
            >
              <MessageSquare className="h-4 w-4" />
            </Button>

            {/* End call button */}
            <Button
              variant="destructive"
              size="sm"
              onClick={handleEndCall}
              className="gap-2"
            >
              <PhoneOff className="h-4 w-4" />
              <span className="hidden sm:inline">{t('end_call')}</span>
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// Loading state
function VoiceModeLoading() {
  const t = useTranslations('tuna.voice');

  return (
    <motion.div
      className={cn(
        'fixed right-0 bottom-0 left-0 z-30',
        'mx-2 mb-2 md:mx-4 md:mb-4',
        'flex justify-center'
      )}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div
        className={cn(
          'rounded-2xl border border-border/30',
          'bg-background/70 backdrop-blur-lg',
          'px-6 py-4 shadow-xl'
        )}
      >
        <div className="flex items-center gap-3">
          <motion.div
            className="h-8 w-8 rounded-full bg-muted"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
          <span className="text-muted-foreground text-sm">
            {t('preparing')}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

// Error state
function VoiceModeError({
  error,
  onRetry,
  onClose,
}: {
  error: string;
  onRetry: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('tuna.voice');

  return (
    <motion.div
      className={cn(
        'fixed right-0 bottom-0 left-0 z-30',
        'mx-2 mb-2 md:mx-4 md:mb-4',
        'flex justify-center'
      )}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div
        className={cn(
          'rounded-2xl border border-border/30',
          'bg-background/70 backdrop-blur-lg',
          'px-6 py-4 shadow-xl'
        )}
      >
        <div className="flex flex-col items-center gap-3">
          <p className="text-muted-foreground text-sm">{error}</p>
          <div className="flex gap-2">
            <Button onClick={onRetry} variant="outline" size="sm">
              {t('retry')}
            </Button>
            <Button onClick={onClose} variant="ghost" size="sm">
              {t('close')}
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// Main exported component
export function VoiceChatMode({
  wsId,
  isOpen,
  onClose,
  onAnimationChange,
  onMessage,
}: VoiceChatModeProps) {
  const t = useTranslations('tuna.voice');
  const { token, isLoading, error, refreshToken } = useTunaToken(wsId);

  if (!isOpen) return null;

  if (isLoading) {
    return <VoiceModeLoading />;
  }

  if (error || !token) {
    return (
      <VoiceModeError
        error={error?.message || t('unavailable')}
        onRetry={() => refreshToken()}
        onClose={onClose}
      />
    );
  }

  return (
    <LiveAPIProvider key={token} apiKey={token} wsId={wsId}>
      <VoiceModeActionBar
        onClose={onClose}
        onAnimationChange={onAnimationChange}
        onMessage={onMessage}
      />
    </LiveAPIProvider>
  );
}
