'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export function useVocabularySpeech() {
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  const stopPlayback = useCallback((clearState = true) => {
    controllerRef.current?.abort();
    controllerRef.current = null;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
      audioRef.current = null;
    }

    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }

    if (clearState) setPlayingKey(null);
  }, []);

  useEffect(() => () => stopPlayback(false), [stopPlayback]);

  async function playSpeech(
    text: string,
    kind: 'example' | 'word',
    key: string
  ) {
    stopPlayback();
    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      setPlayingKey(key);
      const response = await fetch('/api/v1/vocabulary/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ kind, text }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error('Could not generate speech.');
      }

      const audioUrl = URL.createObjectURL(await response.blob());
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audioUrlRef.current = audioUrl;
      const finishPlayback = () => {
        if (audioRef.current !== audio) return;
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
        audioUrlRef.current = null;
        setPlayingKey(null);
      };
      audio.onended = finishPlayback;
      audio.onerror = finishPlayback;
      await audio.play();
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        console.error('Failed to play vocabulary speech', error);
      }
      if (controllerRef.current === controller) {
        stopPlayback();
      }
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    }
  }

  return { playSpeech, playingKey };
}
