'use client';

import { useEffect } from 'react';

/**
 * The side panel's width lives in CSS variables on the page root: one for the
 * panel and one for the board's right padding. A drag writes both straight
 * from each pointer move, with transitions off, so the edge stays under the
 * cursor and nothing goes through React. The chosen width is remembered.
 */
const WIDTH_KEY = 'tasks.task-panel-width';
const PANEL_VAR = '--task-panel-width';
const BOARD_VAR = '--task-board-panel-width';
const TRANSITION_VAR = '--task-board-panel-transition';
export const TASK_PANEL_DEFAULT_WIDTH = 576;
export const TASK_PANEL_MIN_WIDTH = 360;

let preferred: number | null = null;

/** At most two fifths of the window, so the board keeps most of the screen. */
export function getTaskPanelMaxWidth() {
  return Math.max(TASK_PANEL_MIN_WIDTH, Math.floor(window.innerWidth * 0.4));
}

function clamp(width: number) {
  return Math.round(
    Math.max(TASK_PANEL_MIN_WIDTH, Math.min(width, getTaskPanelMaxWidth()))
  );
}

function preferredWidth() {
  if (preferred === null) {
    const saved = Number(window.localStorage.getItem(WIDTH_KEY));
    preferred = saved > 0 ? saved : TASK_PANEL_DEFAULT_WIDTH;
  }
  return preferred;
}

/** The width the panel shows now, after the window bounds. */
export function getTaskPanelWidth() {
  return clamp(preferredWidth());
}

/** Sizes the panel and the board's room for it, without remembering it. */
export function applyTaskPanelWidth(width: number) {
  const next = clamp(width);
  const { style } = document.documentElement;
  style.setProperty(PANEL_VAR, `${next}px`);
  style.setProperty(BOARD_VAR, `${next}px`);
  return next;
}

/** Starts a drag: the board follows the edge with no transition. */
export function startTaskPanelResize() {
  document.documentElement.style.setProperty(TRANSITION_VAR, '0ms');
}

/** Ends a drag: remembers the width, then the transition comes back. */
export function endTaskPanelResize(width: number) {
  const next = saveTaskPanelWidth(width);
  requestAnimationFrame(() =>
    document.documentElement.style.removeProperty(TRANSITION_VAR)
  );
  return next;
}

/** Shows and remembers the width the user chose. */
export function saveTaskPanelWidth(width: number) {
  preferred = clamp(width);
  window.localStorage.setItem(WIDTH_KEY, String(preferred));
  return applyTaskPanelWidth(preferred);
}

/** Sets the variable and keeps it within bounds as the window resizes. */
export function useTaskPanelWidthVariable(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const apply = () => applyTaskPanelWidth(preferredWidth());
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, [enabled]);
}
