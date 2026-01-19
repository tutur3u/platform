'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

interface TextMorphOptions {
  texts: string[];
  interval?: number;
  morphDuration?: number;
}

interface CharState {
  char: string;
  isChanging: boolean;
}

export function useTextMorph(options: TextMorphOptions) {
  const { texts, interval = 4000, morphDuration = 800 } = options;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isMorphing, setIsMorphing] = useState(false);
  const [displayChars, setDisplayChars] = useState<CharState[]>([]);

  const currentText = texts[currentIndex] ?? '';
  const nextIndex = (currentIndex + 1) % texts.length;
  const nextText = texts[nextIndex] ?? '';

  // Initialize display chars
  useEffect(() => {
    setDisplayChars(
      currentText.split('').map((char) => ({ char, isChanging: false }))
    );
  }, [currentText]);

  const morph = useCallback(() => {
    setIsMorphing(true);

    const maxLength = Math.max(currentText.length, nextText.length);
    const morphSteps = maxLength;
    const stepDuration = morphDuration / morphSteps;

    // Stagger character changes
    for (let i = 0; i < maxLength; i++) {
      setTimeout(() => {
        setDisplayChars((prev) => {
          const newChars = [...prev];
          const nextChar = nextText[i] || '';
          const currentChar = currentText[i] || '';

          if (i < newChars.length) {
            newChars[i] = {
              char: nextChar || currentChar,
              isChanging: nextChar !== currentChar,
            };
          } else if (nextChar) {
            newChars.push({ char: nextChar, isChanging: true });
          }

          // Trim if next text is shorter
          if (i === maxLength - 1 && nextText.length < prev.length) {
            return newChars.slice(0, nextText.length);
          }

          return newChars;
        });

        // Mark as not changing after brief animation
        setTimeout(() => {
          setDisplayChars((prev) =>
            prev.map((c, idx) => (idx === i ? { ...c, isChanging: false } : c))
          );
        }, 150);
      }, i * stepDuration);
    }

    // Complete morph
    setTimeout(() => {
      setCurrentIndex(nextIndex);
      setIsMorphing(false);
    }, morphDuration);
  }, [currentText, nextText, nextIndex, morphDuration]);

  useEffect(() => {
    // Check for reduced motion preference
    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;
    if (prefersReducedMotion) return;

    const timer = setInterval(() => {
      if (!isMorphing) {
        morph();
      }
    }, interval);

    return () => clearInterval(timer);
  }, [interval, isMorphing, morph]);

  const characters = useMemo(() => displayChars, [displayChars]);

  return {
    characters,
    currentIndex,
    isMorphing,
    currentText,
    triggerMorph: morph,
  };
}
