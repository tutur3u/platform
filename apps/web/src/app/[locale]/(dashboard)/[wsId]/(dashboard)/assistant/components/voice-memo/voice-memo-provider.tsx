'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AudioRecorder } from '../../audio/audio-recorder';

interface VoiceMemoContextType {
  isUserSpeaking: boolean;
  recorder: AudioRecorder | null;
}

const VoiceMemoContext = createContext<VoiceMemoContextType>({
  isUserSpeaking: false,
  recorder: null,
});

export function VoiceMemoProvider({ children }: { children: React.ReactNode }) {
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [mounted, setMounted] = useState(false);
  const recorderRef = useRef<AudioRecorder | null>(null);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      recorderRef.current = new AudioRecorder();

      const handleVolume = (volume: number) => {
        setIsUserSpeaking(volume > 0.1);
      };

      recorderRef.current.on('volume', handleVolume);

      return () => {
        recorderRef.current?.off('volume', handleVolume);
        recorderRef.current?.stop();
      };
    }
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <VoiceMemoContext.Provider
      value={{
        isUserSpeaking,
        recorder: recorderRef.current,
      }}
    >
      {children}
    </VoiceMemoContext.Provider>
  );
}

export const useVoiceMemo = () => useContext(VoiceMemoContext);
