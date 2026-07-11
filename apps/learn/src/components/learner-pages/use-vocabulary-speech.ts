'use client';

import { useState } from 'react';

export function useVocabularySpeech() {
  const [playingKey, setPlayingKey] = useState<string | null>(null);

  async function playSpeech(
    text: string,
    kind: 'example' | 'word',
    key: string
  ) {
    try {
      setPlayingKey(key);
      const response = await fetch('/api/v1/vocabulary/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ kind, text }),
      });

      if (!response.ok) {
        throw new Error('Could not generate speech.');
      }

      const audioUrl = URL.createObjectURL(await response.blob());
      const audio = new Audio(audioUrl);
      const finishPlayback = () => {
        URL.revokeObjectURL(audioUrl);
        setPlayingKey(null);
      };
      audio.onended = finishPlayback;
      audio.onerror = finishPlayback;
      await audio.play();
    } catch (error) {
      console.error('Failed to play vocabulary speech', error);
      setPlayingKey(null);
    }
  }

  return { playSpeech, playingKey };
}
