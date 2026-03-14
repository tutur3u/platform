import { useCallback, useEffect, useRef } from 'react';

export const useSound = (src: string, volume = 0.5) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      audioRef.current = new Audio(src);
      audioRef.current.volume = volume;
    }
  }, [src, volume]);

  const play = useCallback(() => {
    if (audioRef.current) {
      // Reset the audio to the beginning to allow rapid sequential plays
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch((e) => {
        // Ignore autoplay policy errors in browser
        console.log('Audio playback prevented:', e);
      });
    }
  }, []);

  return play;
};
