/**
 * The pulse chart's pointer state machine, pure so it can be tested
 * without a browser. The plot is one pointer target: a press selects the
 * day under the pointer, a drag follows it, and a release ends the press.
 *
 * Every way a press can end clears it: pointerup, pointercancel (a touch
 * that turned into a vertical scroll) and lostpointercapture (the browser
 * dropped the capture without an up). A move that arrives with no button
 * held is never part of a drag, whatever the press state says. A cancelled
 * press puts the selection back as it was before the press, so a swipe
 * that scrolls the page never leaves a day selected.
 */

export type Press = {
  id: number;
  /** Touch and pen: the day was already selected (a tap clears it). */
  wasActive: boolean;
  moved: boolean;
  index: number;
  /** The selection before the press, restored if it is cancelled. */
  before: { active: number | null; roving: number };
};

export type ChartState = {
  press: Press | null;
  /** The selected (or hovered) day; null shows no tooltip. */
  active: number | null;
  /** The day that holds the roving focus. */
  roving: number;
};

export type PressEvent =
  | { type: 'down'; id: number; index: number; pointerType: string }
  | {
      type: 'move';
      id: number;
      index: number;
      pointerType: string;
      /** PointerEvent.buttons: 0 when nothing is held. */
      buttons: number;
    }
  | { type: 'up'; id: number }
  | { type: 'cancel'; id: number }
  | { type: 'lost'; id: number };

export function pressStep(state: ChartState, event: PressEvent): ChartState {
  const { press } = state;
  const own = press !== null && press.id === event.id;
  switch (event.type) {
    case 'down':
      return {
        press: {
          id: event.id,
          wasActive:
            event.pointerType !== 'mouse' && state.active === event.index,
          moved: false,
          index: event.index,
          before: { active: state.active, roving: state.roving },
        },
        active: event.index,
        roving: event.index,
      };
    case 'move': {
      if (own && event.buttons !== 0) {
        if (event.index === press.index) return state;
        return {
          press: { ...press, moved: true, index: event.index },
          active: event.index,
          roving: event.index,
        };
      }
      // No button held: any press left over is stale (its up was lost).
      const next = own ? { ...state, press: null } : state;
      // A mouse or pen hovering shows the day under it; touch never hovers.
      if (event.pointerType === 'touch' || next.active === event.index)
        return next;
      return { ...next, active: event.index };
    }
    case 'up':
      if (!own) return state;
      return {
        ...state,
        press: null,
        active: press.wasActive && !press.moved ? null : state.active,
      };
    case 'cancel':
      if (!own) return state;
      return { press: null, ...press.before };
    case 'lost':
      if (!own) return state;
      return { ...state, press: null };
  }
}
