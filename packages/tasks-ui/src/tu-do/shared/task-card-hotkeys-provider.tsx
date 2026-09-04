'use client';

import { useUserConfig } from '@tuturuuu/ui/hooks/use-user-config';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import {
  isTaskCardHotkeyEditableTarget,
  parseTaskCardHotkeyBindings,
  TASK_CARD_HOTKEY_ACTIONS,
  TASK_CARD_HOTKEY_EVENT,
  TASK_CARD_HOTKEYS_CONFIG_ID,
  taskCardHotkeyMatches,
} from './task-card-hotkeys';

export function TaskCardHotkeysProvider({
  children,
  enabled = true,
}: {
  children: ReactNode;
  enabled?: boolean;
}) {
  const hoveredCardRef = useRef<HTMLElement | null>(null);
  const { data: rawBindings } = useUserConfig(TASK_CARD_HOTKEYS_CONFIG_ID, '', {
    enabled,
  });
  const bindings = useMemo(
    () => parseTaskCardHotkeyBindings(rawBindings),
    [rawBindings]
  );

  useEffect(() => {
    if (!enabled) return;

    const clearHoveredCard = () => {
      hoveredCardRef.current?.removeAttribute('data-task-hotkey-target');
      hoveredCardRef.current = null;
    };
    const setHoveredCard = (card: HTMLElement | null) => {
      if (hoveredCardRef.current === card) return;
      clearHoveredCard();
      hoveredCardRef.current = card;
      card?.setAttribute('data-task-hotkey-target', 'true');
    };
    const onPointerOver = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      setHoveredCard(target.closest<HTMLElement>('[data-task-id]'));
    };
    const onPointerOut = (event: PointerEvent) => {
      const card = hoveredCardRef.current;
      if (!card) return;
      const relatedTarget = event.relatedTarget;
      if (relatedTarget instanceof Node && card.contains(relatedTarget)) return;
      if (event.target instanceof Node && card.contains(event.target)) {
        clearHoveredCard();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const card = hoveredCardRef.current;
      if (
        !card?.isConnected ||
        event.repeat ||
        isTaskCardHotkeyEditableTarget(event.target)
      ) {
        return;
      }

      const action = TASK_CARD_HOTKEY_ACTIONS.find((candidate) =>
        taskCardHotkeyMatches(event, bindings[candidate])
      );
      if (!action) return;

      event.preventDefault();
      event.stopPropagation();
      card.dispatchEvent(
        new CustomEvent(TASK_CARD_HOTKEY_EVENT, {
          detail: { action },
        })
      );
    };

    document.addEventListener('pointerover', onPointerOver);
    document.addEventListener('pointerout', onPointerOut);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('blur', clearHoveredCard);
    return () => {
      document.removeEventListener('pointerover', onPointerOver);
      document.removeEventListener('pointerout', onPointerOut);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('blur', clearHoveredCard);
      clearHoveredCard();
    };
  }, [bindings, enabled]);

  return children;
}
