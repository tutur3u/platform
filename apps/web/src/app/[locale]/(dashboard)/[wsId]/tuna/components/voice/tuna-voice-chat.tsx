'use client';

import {
  Loader2,
  MessageSquare,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Send,
  Sparkles,
} from '@tuturuuu/icons';
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

interface TunaVoiceChatProps {
  wsId: string;
  onAnimationChange?: (state: TunaAnimationState) => void;
  onMessage?: (message: string) => void;
  className?: string;
}

function useAudioRecorder() {
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [isRecorderReady, setIsRecorderReady] = useState(false);
  const recorderRef = useRef<AudioRecorder | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      recorderRef.current = new AudioRecorder();
      setIsRecorderReady(true);
      return () => {
        recorderRef.current?.stop();
        setIsRecorderReady(false);
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

  return { isUserSpeaking, isRecorderReady, recorder: recorderRef.current };
}

// Status indicator component
function VoiceStatus({
  connectionStatus,
  isUserSpeaking,
  isSpeaking,
}: {
  connectionStatus: ConnectionStatus;
  isUserSpeaking: boolean;
  isSpeaking: boolean;
}) {
  const t = useTranslations('tuna.voice');

  const getStatus = () => {
    if (connectionStatus === 'connecting') return t('status.connecting');
    if (connectionStatus === 'reconnecting') return t('status.reconnecting');
    if (connectionStatus === 'disconnected') return t('status.tap_to_talk');
    if (isUserSpeaking) return t('status.listening');
    if (isSpeaking) return t('status.tuna_speaking');
    return t('status.ready');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-center text-muted-foreground text-xs"
    >
      {getStatus()}
    </motion.div>
  );
}

// Text chat input component
function TextChatInput({
  onSubmit,
  disabled,
}: {
  onSubmit: (message: string) => Promise<void>;
  disabled?: boolean;
}) {
  const t = useTranslations('tuna.voice');
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isDisabled = disabled || isLoading;

  const handleSubmit = async () => {
    if (input.trim() && !isDisabled) {
      setIsLoading(true);
      try {
        await onSubmit(input.trim());
        setInput('');
        inputRef.current?.focus();
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Input
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={disabled ? t('connect_to_chat') : t('type_message')}
        className="h-9 border-border/60 bg-background/80 text-sm backdrop-blur placeholder:text-muted-foreground supports-backdrop-filter:bg-background/60"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
          }
        }}
        disabled={isDisabled}
      />
      <Button
        variant="secondary"
        size="icon"
        className="h-9 w-9 shrink-0 border border-border/60 shadow-sm"
        disabled={isDisabled || !input.trim()}
        onClick={handleSubmit}
        aria-label={t('send_message')}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}

// Main voice control component
function VoiceControl({
  onAnimationChange,
  onMessage,
  className,
}: Omit<TunaVoiceChatProps, 'wsId'>) {
  const t = useTranslations('tuna.voice');
  const { client, connected, connectionStatus, connect, disconnect, volume } =
    useLiveAPIContext();
  const { isUserSpeaking } = useAudioRecorder();
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [showTextChat, setShowTextChat] = useState(false);

  // Update Tuna's animation based on voice state
  useEffect(() => {
    if (!onAnimationChange) return;

    if (isSpeaking) {
      onAnimationChange('speaking');
    } else if (isUserSpeaking) {
      onAnimationChange('listening');
    } else if (connected) {
      onAnimationChange('idle');
    }
  }, [isSpeaking, isUserSpeaking, connected, onAnimationChange]);

  // Listen for AI audio output
  useEffect(() => {
    if (!client) return;

    const handleAudio = () => setIsSpeaking(true);
    const handleTurnComplete = () => {
      setIsSpeaking(false);
      onAnimationChange?.('idle');
    };
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
  }, [client, onAnimationChange, onMessage]);

  const handleToggleConnection = useCallback(async () => {
    if (connected) {
      await disconnect();
      onAnimationChange?.('idle');
    } else {
      await connect();
    }
  }, [connected, connect, disconnect, onAnimationChange]);

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => !prev);
    // TODO: Implement actual mute functionality with audio recorder
  }, []);

  const handleTextSubmit = useCallback(
    async (text: string) => {
      if (client && connected) {
        client.send({ text }, true);
        onAnimationChange?.('listening');
      }
    },
    [client, connected, onAnimationChange]
  );

  return (
    <div className={cn('flex flex-col items-center gap-3', className)}>
      {/* Voice activity indicator */}
      <AnimatePresence>
        {connected && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="relative"
          >
            {/* Pulsing ring when speaking */}
            {(isSpeaking || isUserSpeaking) && (
              <motion.div
                className={cn(
                  'absolute inset-0 rounded-full',
                  isSpeaking ? 'bg-dynamic-purple/30' : 'bg-dynamic-green/30'
                )}
                animate={{ scale: [1, 1.4, 1], opacity: [0.6, 0.2, 0.6] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            )}
            <div
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-full',
                isSpeaking
                  ? 'bg-dynamic-purple/20'
                  : isUserSpeaking
                    ? 'bg-dynamic-green/20'
                    : 'bg-muted/50'
              )}
            >
              <motion.div
                animate={{ scale: 1 + volume * 0.3 }}
                transition={{ type: 'spring', stiffness: 300 }}
              >
                {isSpeaking ? (
                  <Sparkles className="h-5 w-5 text-dynamic-purple" />
                ) : (
                  <Mic
                    className={cn(
                      'h-5 w-5',
                      isUserSpeaking
                        ? 'text-dynamic-green'
                        : 'text-muted-foreground'
                    )}
                  />
                )}
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Control buttons */}
      <div className="flex items-center gap-2">
        {/* Connect/Disconnect button */}
        <Button
          onClick={handleToggleConnection}
          variant={connected ? 'destructive' : 'default'}
          size="sm"
          className="gap-2"
          disabled={
            connectionStatus === 'connecting' ||
            connectionStatus === 'reconnecting'
          }
        >
          {connected ? (
            <>
              <PhoneOff className="h-4 w-4" />
              {t('end_call')}
            </>
          ) : (
            <>
              <Phone className="h-4 w-4" />
              {t('talk_to_tuna')}
            </>
          )}
        </Button>

        {/* Mute button (only when connected) */}
        {connected && (
          <Button
            onClick={handleToggleMute}
            variant={muted ? 'destructive' : 'outline'}
            size="icon"
            className="h-9 w-9"
          >
            {muted ? (
              <MicOff className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </Button>
        )}

        {/* Text chat toggle button (only when connected) */}
        {connected && (
          <Button
            onClick={() => setShowTextChat((prev) => !prev)}
            variant={showTextChat ? 'secondary' : 'outline'}
            size="icon"
            className="h-9 w-9"
            aria-label={t('toggle_text_chat')}
          >
            <MessageSquare className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Text chat input (when connected and toggled) */}
      <AnimatePresence>
        {connected && showTextChat && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="w-full overflow-hidden"
          >
            <TextChatInput onSubmit={handleTextSubmit} disabled={!connected} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Status text */}
      <VoiceStatus
        connectionStatus={connectionStatus}
        isUserSpeaking={isUserSpeaking}
        isSpeaking={isSpeaking}
      />
    </div>
  );
}

// Wrapper component that handles token loading
export function TunaVoiceChat({ wsId, ...props }: TunaVoiceChatProps) {
  const t = useTranslations('tuna.voice');
  const { token, isLoading, error, refreshToken } = useTunaToken(wsId);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-2">
        <motion.div
          className="h-10 w-10 rounded-full bg-muted"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
        <span className="text-muted-foreground text-xs">{t('preparing')}</span>
      </div>
    );
  }

  if (error || !token) {
    return (
      <div className="flex flex-col items-center gap-2">
        <p className="text-muted-foreground text-xs">
          {error?.message || t('unavailable')}
        </p>
        <Button onClick={() => refreshToken()} variant="outline" size="sm">
          {t('retry')}
        </Button>
      </div>
    );
  }

  return (
    <LiveAPIProvider key={token} apiKey={token} wsId={wsId}>
      <VoiceControl {...props} />
    </LiveAPIProvider>
  );
}
