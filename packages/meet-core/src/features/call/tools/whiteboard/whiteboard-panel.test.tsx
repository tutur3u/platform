// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import enMessages from '../../../../../../../apps/meet/messages/en.json';
import viMessages from '../../../../../../../apps/meet/messages/vi.json';
import type { MeetToolPanelProps } from '../live-activities/meet-tool';
import { whiteboardTool } from './definition';
import { WHITEBOARD_HEIGHT, WHITEBOARD_WIDTH } from './stroke';
import { WhiteboardPanel } from './whiteboard-panel';
import { clearWhiteboard, readWhiteboard } from './whiteboard-store';

const meetingId = 'meeting-panel';

afterEach(() => {
  cleanup();
  clearWhiteboard(meetingId);
});

function renderPanel(
  locale: 'en' | 'vi' = 'en',
  props: MeetToolPanelProps = {}
) {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === 'en' ? enMessages : viMessages}
      onError={(error) => {
        throw error;
      }}
    >
      <WhiteboardPanel meetingId={meetingId} participantId="ana" {...props} />
    </NextIntlClientProvider>
  );
}

/** The surface fills a 600 by 450 box whose corner sits at 20, 40. */
function surface() {
  const svg = screen.getByRole('img', { name: 'Whiteboard' });
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
    left: 20,
    top: 40,
    width: WHITEBOARD_WIDTH / 2,
    height: WHITEBOARD_HEIGHT / 2,
  } as DOMRect);
  return svg;
}

const strokes = () => readWhiteboard(meetingId).strokes;

it('exports a tool definition the call shell can list', () => {
  expect(whiteboardTool.id).toBe('pen-whiteboard');
  // The hub translates the label, so it must be a key both catalogs carry.
  expect(whiteboardTool.label).toBe('meet.classroom_tools.whiteboard.title');
  expect(enMessages.meet.classroom_tools.whiteboard.title).toBe('Whiteboard');
  expect(viMessages.meet.classroom_tools.whiteboard.title).toBeTruthy();
  expect(
    typeof whiteboardTool.icon === 'function' ||
      typeof whiteboardTool.icon === 'object'
  ).toBe(true);
  expect(whiteboardTool.Panel).toBe(WhiteboardPanel);
});

it.each(['en', 'vi'] as const)(
  'gives every button an icon and a name in %s',
  (locale) => {
    renderPanel(locale, { role: 'host', onClose: () => {} });
    const buttons = screen.getAllByRole('button');
    // Four inks, undo, clear and close.
    expect(buttons).toHaveLength(7);
    for (const button of buttons) {
      expect(button.querySelector('svg')).not.toBeNull();
      expect(button.getAttribute('aria-label')).toBeTruthy();
      expect(button.textContent).toBe('');
      expect(button.dataset.variant).toBe('ghost');
      expect(button.dataset.size).toBe('icon');
    }
  }
);

it('draws a pen stroke with its pressure and tilt', () => {
  renderPanel();
  const svg = surface();
  const pen = { pointerId: 1, pointerType: 'pen', button: 0 };
  fireEvent.pointerDown(svg, {
    ...pen,
    clientX: 70,
    clientY: 90,
    pressure: 0.2,
    tiltX: 30,
    tiltY: -12,
  });
  fireEvent.pointerMove(svg, {
    ...pen,
    clientX: 120,
    clientY: 90,
    pressure: 0.9,
    tiltX: 34,
    tiltY: -15,
  });
  // The stroke shows while it is still being drawn.
  expect(svg.querySelectorAll('path').length).toBeGreaterThan(0);
  expect(strokes()).toHaveLength(0);
  fireEvent.pointerUp(svg, { ...pen, clientX: 120, clientY: 90, pressure: 0 });

  expect(strokes()).toHaveLength(1);
  const [stroke] = strokes();
  expect(stroke).toMatchObject({ authorId: 'ana', input: 'pen', color: 'ink' });
  expect(
    stroke?.points.map(({ x, y, pressure, tiltX, tiltY }) => ({
      x,
      y,
      pressure,
      tiltX,
      tiltY,
    }))
  ).toEqual([
    { x: 100, y: 100, pressure: 0.2, tiltX: 30, tiltY: -12 },
    { x: 200, y: 100, pressure: 0.9, tiltX: 34, tiltY: -15 },
  ]);
  expect(svg.querySelectorAll('g > g')).toHaveLength(1);
});

it('ignores a palm while the pen is down and still draws with a mouse', () => {
  renderPanel();
  const svg = surface();
  const pen = { pointerId: 1, pointerType: 'pen', button: 0 };
  const palm = { pointerId: 2, pointerType: 'touch', button: 0 };
  fireEvent.pointerDown(svg, { ...pen, clientX: 70, clientY: 90 });
  fireEvent.pointerDown(svg, { ...palm, clientX: 400, clientY: 300 });
  fireEvent.pointerMove(svg, { ...palm, clientX: 430, clientY: 320 });
  fireEvent.pointerUp(svg, { ...palm, clientX: 430, clientY: 320 });
  fireEvent.pointerMove(svg, { ...pen, clientX: 120, clientY: 90 });
  fireEvent.pointerUp(svg, { ...pen, clientX: 120, clientY: 90 });
  expect(strokes().map((stroke) => stroke.input)).toEqual(['pen']);

  fireEvent.click(screen.getByRole('button', { name: 'Blue' }));
  const mouse = { pointerId: 3, pointerType: 'mouse', button: 0 };
  fireEvent.pointerDown(svg, { ...mouse, clientX: 220, clientY: 240 });
  fireEvent.pointerMove(svg, { ...mouse, clientX: 320, clientY: 240 });
  fireEvent.pointerUp(svg, { ...mouse, clientX: 320, clientY: 240 });

  const mouseStroke = strokes()[1];
  expect(mouseStroke).toMatchObject({ input: 'mouse', color: 'blue' });
  expect(mouseStroke?.points.map((point) => point.pressure)).toEqual([
    0.5, 0.5,
  ]);
  expect(
    screen.getByRole('button', { name: 'Blue' }).getAttribute('aria-pressed')
  ).toBe('true');
});

it('undoes the last stroke and lets the host clear the board', () => {
  renderPanel('en', { role: 'host' });
  const svg = surface();
  const undo = screen.getByRole('button', { name: 'Undo drawing' });
  const clear = screen.getByRole('button', { name: 'Clear board' });
  expect(undo).toHaveProperty('disabled', true);
  expect(clear).toHaveProperty('disabled', true);

  for (const pointerId of [1, 2]) {
    const mouse = { pointerId, pointerType: 'mouse', button: 0 };
    fireEvent.pointerDown(svg, { ...mouse, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(svg, { ...mouse, clientX: 160, clientY: 100 });
  }
  expect(strokes()).toHaveLength(2);

  fireEvent.click(undo);
  expect(strokes()).toHaveLength(1);
  expect(svg.querySelectorAll('g > g')).toHaveLength(1);
  fireEvent.click(clear);
  expect(strokes()).toHaveLength(0);
  expect(svg.querySelectorAll('g > g')).toHaveLength(0);
});

it('keeps clearing the board to the host', () => {
  renderPanel();
  expect(screen.getByRole('button', { name: 'Undo drawing' })).toBeDefined();
  expect(screen.queryByRole('button', { name: 'Clear board' })).toBeNull();
});
