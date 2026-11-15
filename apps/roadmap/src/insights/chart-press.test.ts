/**
 * The pulse chart's press lifecycle (chart-press.ts): every way a press
 * ends clears it, a move with no button held never drags, and a touch that
 * turns into a scroll (pointercancel) leaves no day selected. Broken
 * variants: the earlier handlers (no capture, no lostpointercapture, no
 * buttons check) and one that ignores pointercancel. Run via
 * src/roadmap-data.test.ts.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { dayAt } from './chart-nav.ts';
import { type ChartState, type PressEvent, pressStep } from './chart-press.ts';

const DAYS = 14;
const start: ChartState = { press: null, active: null, roving: DAYS - 1 };
const run = (
  step: (s: ChartState, e: PressEvent) => ChartState,
  events: PressEvent[],
  from = start
) => events.reduce(step, from);
// A 290px plot at x = 50: pointer x to day, clamped like the component.
const day = (x: number) => dayAt(x, 50, 290, DAYS);

/** The handlers before r5: no buttons check, no lost capture, cancel keeps the selection. */
function legacy(state: ChartState, event: PressEvent): ChartState {
  const { press } = state;
  const own = press !== null && press.id === event.id;
  if (event.type === 'move' && own) {
    if (event.index === press.index) return state;
    return {
      press: { ...press, moved: true, index: event.index },
      active: event.index,
      roving: event.index,
    };
  }
  if (event.type === 'lost') return state;
  if (event.type === 'cancel') return own ? { ...state, press: null } : state;
  return pressStep(state, event);
}

describe('pulse chart: the press lifecycle', () => {
  it('mouse: drag out of the plot clamps, release outside ends the press, hover no longer drags', () => {
    const mouse = (type: 'down' | 'move', x: number, buttons = 1) =>
      type === 'down'
        ? ({ type, id: 1, index: day(x), pointerType: 'mouse' } as const)
        : ({
            type,
            id: 1,
            index: day(x),
            pointerType: 'mouse',
            buttons,
          } as const);
    // Captured: the moves outside and the up outside reach the plot.
    const captured: PressEvent[] = [
      mouse('down', 50 + 2.5 * (290 / DAYS)),
      mouse('move', 900),
      { type: 'up', id: 1 },
      { type: 'lost', id: 1 },
      mouse('move', 50 + 4.5 * (290 / DAYS), 0),
    ];
    const ours = run(pressStep, captured);
    assert.equal(ours.press, null);
    assert.equal(ours.roving, DAYS - 1, 'the drag clamped to the last day');
    assert.equal(ours.active, 4, 'hover shows the day, it does not drag');
    // Broken variant (no capture): the plot sees neither the moves outside
    // nor the up, so the press sticks and a plain hover drags the focus.
    const uncaptured = [captured[0], captured[4]] as PressEvent[];
    const broken = run(legacy, uncaptured);
    assert.notEqual(broken.press, null);
    assert.equal(broken.roving, 4, 'the earlier handlers drag on hover');
    // Ours on the same uncaptured stream: buttons === 0 ends the stale press.
    const guarded = run(pressStep, uncaptured);
    assert.equal(guarded.press, null);
    assert.equal(guarded.roving, 2, 'no drag without a held button');
  });

  it('a lost capture (no up) ends the press', () => {
    const events: PressEvent[] = [
      { type: 'down', id: 3, index: 5, pointerType: 'pen' },
      { type: 'lost', id: 3 },
    ];
    assert.equal(run(pressStep, events).press, null);
    // Broken variant: ignoring lostpointercapture leaves the press set.
    assert.notEqual(run(legacy, events).press, null);
  });

  it('touch: a swipe that scrolls (pointercancel) leaves no day selected', () => {
    const selected: ChartState = { press: null, active: 6, roving: 6 };
    for (const from of [start, selected]) {
      const events: PressEvent[] = [
        { type: 'down', id: 9, index: 2, pointerType: 'touch' },
        { type: 'cancel', id: 9 },
      ];
      const ours = run(pressStep, events, from);
      assert.equal(ours.press, null);
      assert.equal(ours.active, from.active, 'the selection is put back');
      assert.equal(ours.roving, from.roving);
      // Broken variant: ignoring pointercancel keeps the touched day.
      const ignoring = (s: ChartState, e: PressEvent) =>
        e.type === 'cancel' ? s : pressStep(s, e);
      const stuck = run(ignoring, events, from);
      assert.equal(stuck.active, 2, 'the swipe would leave day 2 selected');
      assert.notEqual(stuck.press, null);
      // The earlier handlers cleared the press but kept the selection.
      assert.equal(run(legacy, events, from).active, 2);
    }
  });

  it('touch: a tap selects, a second tap clears, a horizontal drag follows', () => {
    const tap = (id: number, index: number): PressEvent[] => [
      { type: 'down', id, index, pointerType: 'touch' },
      { type: 'up', id },
    ];
    const once = run(pressStep, tap(1, 3));
    assert.equal(once.active, 3);
    assert.equal(run(pressStep, tap(2, 3), once).active, null);
    const drag = run(pressStep, [
      { type: 'down', id: 4, index: 2, pointerType: 'touch' },
      { type: 'move', id: 4, index: 6, pointerType: 'touch', buttons: 1 },
      { type: 'move', id: 4, index: 9, pointerType: 'touch', buttons: 1 },
      { type: 'up', id: 4 },
    ]);
    assert.deepEqual(drag, { press: null, active: 9, roving: 9 });
  });

  it('ignores events from another pointer', () => {
    const down = run(pressStep, [
      { type: 'down', id: 1, index: 2, pointerType: 'mouse' },
    ]);
    for (const type of ['up', 'cancel', 'lost'] as const)
      assert.equal(pressStep(down, { type, id: 2 }), down);
  });

  it('the chart wires every end of a press and captures mouse and pen', () => {
    const chart = readFileSync(
      new URL('../components/insights/pulse-chart.tsx', import.meta.url),
      'utf8'
    );
    assert.match(chart, /setPointerCapture\?\.\(event\.pointerId\)/);
    assert.match(
      chart,
      /if \(event\.pointerType !== 'touch'\)\s+event\.currentTarget\.setPointerCapture/
    );
    for (const handler of [
      'onPointerDown',
      'onPointerMove',
      'onPointerUp',
      'onPointerCancel',
      'onLostPointerCapture',
    ])
      assert.match(chart, new RegExp(`${handler}=\\{${handler}\\}`));
    assert.match(chart, /buttons: event\.buttons/);
    assert.match(
      chart,
      /import \{[^}]*\bpressStep\b[^}]*\} from '\.\.\/\.\.\/insights\/chart-press';/
    );
  });
});
