'use client';

import { type RefObject, useCallback, useEffect, useState } from 'react';

interface MagneticOptions {
  strength?: number;
  radius?: number;
  ease?: number;
}

interface MagneticState {
  x: number;
  y: number;
  isHovering: boolean;
}

export function useMagnetic<T extends HTMLElement>(
  ref: RefObject<T | null>,
  options: MagneticOptions = {}
): MagneticState {
  const { strength = 0.3, radius = 200, ease = 0.15 } = options;

  const [state, setState] = useState<MagneticState>({
    x: 0,
    y: 0,
    isHovering: false,
  });

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const element = ref.current;
      if (!element) return;

      const rect = element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const distanceX = e.clientX - centerX;
      const distanceY = e.clientY - centerY;
      const distance = Math.sqrt(distanceX ** 2 + distanceY ** 2);

      if (distance < radius) {
        const pull = (radius - distance) / radius;
        setState({
          x: distanceX * strength * pull,
          y: distanceY * strength * pull,
          isHovering: true,
        });
      } else {
        setState((prev) => ({
          x: prev.x * (1 - ease),
          y: prev.y * (1 - ease),
          isHovering: false,
        }));
      }
    },
    [ref, strength, radius, ease]
  );

  const handleMouseLeave = useCallback(() => {
    setState({ x: 0, y: 0, isHovering: false });
  }, []);

  useEffect(() => {
    // Check for reduced motion preference
    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;
    if (prefersReducedMotion) return;

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [handleMouseMove, handleMouseLeave]);

  return state;
}
