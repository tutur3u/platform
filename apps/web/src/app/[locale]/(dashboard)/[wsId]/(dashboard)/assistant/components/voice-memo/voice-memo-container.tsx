'use client';

import { memo, useEffect, useState } from 'react';
import { VoiceMemoPanel } from './voice-memo-panel';

interface VoiceMemoContainerProps {
  userMessage?: string;
  assistantMessage?: string;
  isUserSpeaking: boolean;
  isAssistantSpeaking: boolean;
}

function VoiceMemoContainerComponent(props: VoiceMemoContainerProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <VoiceMemoPanel
      userMessage={props.userMessage || '[No input]'}
      assistantMessage={props.assistantMessage || '[Waiting for response...]'}
      isUserSpeaking={!!props.isUserSpeaking}
      isAssistantSpeaking={!!props.isAssistantSpeaking}
    />
  );
}

export const VoiceMemoContainer = memo(VoiceMemoContainerComponent);
