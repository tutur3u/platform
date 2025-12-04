'use client';

import { memo } from 'react';
import { VoiceMemo } from './voice-memo';

interface VoiceMemoPanelProps {
  userMessage: string;
  assistantMessage: string;
  isUserSpeaking: boolean;
  isAssistantSpeaking: boolean;
}

function VoiceMemoPanelComponent(props: VoiceMemoPanelProps) {
  return (
    <div className="mt-4 space-y-4">
      <VoiceMemo
        speaker="user"
        content={props.userMessage}
        isActive={props.isUserSpeaking}
      />
      <VoiceMemo
        speaker="assistant"
        content={props.assistantMessage}
        isActive={props.isAssistantSpeaking}
      />
    </div>
  );
}

export const VoiceMemoPanel = memo(VoiceMemoPanelComponent);
