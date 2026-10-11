import {
  cleanup,
  fireEvent,
  render,
  waitFor,
  within,
} from '@testing-library/react';
import type { Database } from '@tuturuuu/types/supabase';
import { TooltipProvider } from '@tuturuuu/ui/tooltip';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import en from '../../../../../../../apps/finance/messages/en.json';
import vi from '../../../../../../../apps/finance/messages/vi.json';
import { AttendanceCalendar } from './attendance-calendar';

type Props = Parameters<typeof AttendanceCalendar>[0];
type Occurrence = Pick<
  Database['public']['Tables']['user_group_attendance']['Row'],
  'id' | 'session_id' | 'user_id' | 'group_id' | 'date' | 'status'
>;
type Summary = 'ABSENT' | 'LATE' | 'PRESENT' | 'UNKNOWN';
const date = '2026-10-08';
const groupId = '10000000-0000-4000-8000-000000000001';
const otherGroupId = '10000000-0000-4000-8000-000000000002';
const sessions: Props['sessions'] = [{ date, groupId, groupName: 'Class A' }];
const colors = { ABSENT: 'red', LATE: 'yellow', PRESENT: 'green' };
const keys = {
  ABSENT: 'absent',
  LATE: 'late',
  PRESENT: 'present',
  UNKNOWN: 'no_attendance',
} as const;

function attendance(statuses: string[]): Props['userAttendance'] {
  const occurrences: Occurrence[] = statuses.map((status, index) => ({
    id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    session_id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    user_id: '40000000-0000-4000-8000-000000000001',
    group_id: groupId,
    date,
    status,
  }));
  return occurrences.map(({ date, status, group_id }) => ({
    date,
    status,
    group_id,
  }));
}

function mount(
  locale: string,
  messages: typeof en | typeof vi,
  overrides: Partial<Props> = {}
) {
  const props: Props = {
    userAttendance: [],
    selectedMonth: '2026-10',
    sessions,
    locale,
    ...overrides,
  };
  const before = JSON.stringify(props);
  props.userAttendance.forEach(Object.freeze);
  props.sessions.forEach(Object.freeze);
  Object.freeze(props.userAttendance);
  Object.freeze(props.sessions);
  const view = render(
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <TooltipProvider delayDuration={0} skipDelayDuration={0}>
        <AttendanceCalendar {...props} />
      </TooltipProvider>
    </NextIntlClientProvider>
  );
  const grids = view.container.querySelectorAll('.grid-cols-7');
  expect(grids).toHaveLength(2);
  expect(grids[0]?.children).toHaveLength(7);
  expect(grids[1]?.children).toHaveLength(42);
  const cell = Array.from(grids[1]?.children ?? []).find(
    (child) => child.textContent === '8' && child.hasAttribute('data-slot')
  );
  if (!(cell instanceof HTMLElement))
    throw new Error('Current-month October 8 is missing');
  return {
    ...view,
    cell,
    grid: grids[1]!,
    unchanged: () => expect(JSON.stringify(props)).toBe(before),
  };
}

async function hover(cell: HTMLElement) {
  fireEvent.pointerMove(cell, { pointerType: 'mouse', clientX: 1, clientY: 1 });
  return waitFor(() => {
    const content = document.querySelector('[data-slot="tooltip-content"]');
    expect(content).toBeVisible();
    if (!(content instanceof HTMLElement))
      throw new Error('Real tooltip portal is missing');
    return content;
  });
}

function groupStatus(content: HTMLElement, groupName: string) {
  // Accept the visible portal itself; exclude any nested accessibility copy.
  const label = Array.from(content.querySelectorAll('span')).find(
    (span) =>
      span.textContent === `${groupName}:` &&
      (!span.closest('[role="tooltip"]') ||
        span.closest('[role="tooltip"]') === content)
  );
  if (!label?.parentElement)
    throw new Error(`Visible tooltip group ${groupName} is missing`);
  return label.parentElement;
}

function assertSummary(
  cell: HTMLElement,
  line: HTMLElement,
  messages: typeof en | typeof vi,
  status: Summary
) {
  const label = messages['ws-invoices'][keys[status]];
  expect.soft(line.lastElementChild).toHaveTextContent(label);
  expect
    .soft(line.lastElementChild)
    .toHaveClass(
      status === 'UNKNOWN'
        ? 'text-muted-foreground'
        : `text-dynamic-${colors[status]}`
    );
  if (status === 'UNKNOWN') {
    expect
      .soft(cell)
      .toHaveClass('text-foreground/50', 'bg-muted/50', 'border-foreground/20');
  } else {
    const color = colors[status];
    expect
      .soft(cell)
      .toHaveClass(
        `text-dynamic-${color}`,
        `bg-dynamic-${color}/10`,
        `border-dynamic-${color}/20`
      );
  }
}

afterEach(cleanup);

const cases: [string, string[], Summary][] = [
  ['forward PRESENT ABSENT control', ['PRESENT', 'ABSENT'], 'ABSENT'],
  ['reverse ABSENT PRESENT causal regression', ['ABSENT', 'PRESENT'], 'ABSENT'],
  ['PRESENT LATE', ['PRESENT', 'LATE'], 'LATE'],
  ['LATE PRESENT', ['LATE', 'PRESENT'], 'LATE'],
  ['ABSENT LATE', ['ABSENT', 'LATE'], 'ABSENT'],
  ['LATE ABSENT', ['LATE', 'ABSENT'], 'ABSENT'],
  ['triple P L A', ['PRESENT', 'LATE', 'ABSENT'], 'ABSENT'],
  ['triple P A L', ['PRESENT', 'ABSENT', 'LATE'], 'ABSENT'],
  ['triple L P A', ['LATE', 'PRESENT', 'ABSENT'], 'ABSENT'],
  ['triple L A P', ['LATE', 'ABSENT', 'PRESENT'], 'ABSENT'],
  ['triple A P L', ['ABSENT', 'PRESENT', 'LATE'], 'ABSENT'],
  ['triple A L P', ['ABSENT', 'LATE', 'PRESENT'], 'ABSENT'],
  ['single present', ['PRESENT'], 'PRESENT'],
  ['single late', ['LATE'], 'LATE'],
  ['single absent', ['ABSENT'], 'ABSENT'],
  ['duplicate absent', ['ABSENT', 'ABSENT'], 'ABSENT'],
  ['lowercase normalization', ['present', 'absent'], 'ABSENT'],
  ['unknown then known', ['EXCUSED', 'PRESENT'], 'PRESENT'],
  ['known then unknown', ['PRESENT', 'EXCUSED'], 'PRESENT'],
  ['unknown then late', ['EXCUSED', 'LATE'], 'LATE'],
  ['late then unknown', ['LATE', 'EXCUSED'], 'LATE'],
  ['unknown then absent', ['EXCUSED', 'ABSENT'], 'ABSENT'],
  ['absent then unknown', ['ABSENT', 'EXCUSED'], 'ABSENT'],
  ['unknown only', ['EXCUSED'], 'UNKNOWN'],
  ['empty status compatibility', [''], 'PRESENT'],
  ['scheduled without attendance', [], 'UNKNOWN'],
];

describe.each([
  ['en', en],
  ['vi', vi],
] as const)('AttendanceCalendar %s', (locale, messages) => {
  it.each(cases)('%s', async (_name, statuses, expected) => {
    const view = mount(locale, messages, {
      userAttendance: attendance(statuses),
    });
    const content = await hover(view.cell);
    assertSummary(
      view.cell,
      groupStatus(content, 'Class A'),
      messages,
      expected
    );
    view.unchanged();
  });

  it('retains null runtime status fallback', async () => {
    const rows = attendance(['']);
    // Props declare string, but the existing optional-chain fallback accepts null at runtime.
    Reflect.set(rows[0]!, 'status', null);
    const view = mount(locale, messages, { userAttendance: rows });
    const content = await hover(view.cell);
    assertSummary(
      view.cell,
      groupStatus(content, 'Class A'),
      messages,
      'PRESENT'
    );
    view.unchanged();
  });

  it.each([false, true])(
    'keeps separate group statuses, reverse=%s',
    async (reverse) => {
      const rows = attendance(['PRESENT', 'ABSENT']);
      rows[1]!.group_id = otherGroupId;
      const view = mount(locale, messages, {
        userAttendance: reverse ? rows.reverse() : rows,
        sessions: [
          ...sessions,
          { date, groupId: otherGroupId, groupName: 'Class B' },
        ],
      });
      const content = await hover(view.cell);
      expect(
        within(groupStatus(content, 'Class A')).getByText(
          messages['ws-invoices'].present
        )
      ).toHaveClass('text-dynamic-green');
      assertSummary(
        view.cell,
        groupStatus(content, 'Class B'),
        messages,
        'ABSENT'
      );
      view.unchanged();
    }
  );

  it('preserves default group matching when group_id is omitted', async () => {
    const rows = attendance(['PRESENT']);
    delete rows[0]!.group_id;
    const view = mount(locale, messages, {
      userAttendance: rows,
      sessions: [{ date, groupId: 'default', groupName: 'Class A' }],
    });
    const content = await hover(view.cell);
    assertSummary(
      view.cell,
      groupStatus(content, 'Class A'),
      messages,
      'PRESENT'
    );
    view.unchanged();
  });

  it('keeps unscheduled attendance muted with no-session tooltip', async () => {
    const view = mount(locale, messages, {
      userAttendance: attendance(['ABSENT']),
      sessions: [],
    });
    const content = await hover(view.cell);
    expect(view.cell).toHaveClass(
      'text-foreground/30',
      'bg-muted/30',
      'border-transparent'
    );
    expect(
      Array.from(content.querySelectorAll('p')).find(
        (p) =>
          p.textContent === messages['ws-invoices'].no_session &&
          (!p.closest('[role="tooltip"]') ||
            p.closest('[role="tooltip"]') === content)
      )
    ).toBeVisible();
    view.unchanged();
  });

  it('keeps adjacent months muted and maintains the Monday-first 42-day grid on navigation', () => {
    const view = mount(locale, messages);
    const first = view.grid.children[0];
    expect(first).toHaveTextContent('28');
    expect(first).toHaveClass(
      'text-foreground/20',
      'bg-transparent',
      'border-transparent'
    );
    expect(first).not.toHaveAttribute('data-slot');
    view.unchanged();
    view.unmount();
    const next = mount(locale, messages, { selectedMonth: '2026-11' });
    expect(next.grid.children[0]).toHaveTextContent('26');
    expect(next.grid.children[41]).toHaveTextContent('6');
    next.unchanged();
  });
});
