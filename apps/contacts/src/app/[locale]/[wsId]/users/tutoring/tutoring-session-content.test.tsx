import { flexRender, useTable } from '@tanstack/react-table';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import type { TutoringSessionRecord } from '@tuturuuu/internal-api';
import { dataTableFeatures } from '@tuturuuu/ui/custom/tables/data-table';
import { STANDARD_TUTORING_POLICY } from '@tuturuuu/internal-api/tutoring-policy';
import { NextIntlClientProvider, useTranslations } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../../../../messages/en.json';
import { buildTutoringSessionColumns } from './tutoring-session-columns';

const content =
  'First lesson line.\n' +
  'Synthetic lesson details. '.repeat(80) +
  '\nFinal lesson line. <script>not executable</script>';
const session: TutoringSessionRecord = {
  id: 'synthetic-session',
  group_id: 'synthetic-group',
  student_user_id: 'synthetic-student',
  teacher_user_id: null,
  session_date: '2030-01-03',
  start_time: '10:00',
  duration_minutes: 60,
  reason_type: 'ABSENT_RECOVERY',
  reason_detail: '',
  content,
  attendance_status: 'PENDING',
  parent_message_preview: '',
  source_feedback_id: null,
  resolved_at: null,
  created_at: '2030-01-01T00:00:00Z',
  updated_at: '2030-01-01T00:00:00Z',
  group: { id: 'synthetic-group', name: 'Synthetic class' },
  student: {
    id: 'synthetic-student',
    full_name: 'Synthetic learner',
    display_name: null,
    email: null,
  },
  teacher: null,
};
const actions = {
  onEditContent: vi.fn(),
  onDelete: vi.fn(),
  onMark: vi.fn(),
  onParentMessage: vi.fn(),
};
function ScheduleRow({
  canManage,
  record,
}: {
  canManage: boolean;
  record: TutoringSessionRecord;
}) {
  const t = useTranslations('ws-tutoring');
  const tableT = useTranslations();
  const table = useTable({
    features: dataTableFeatures,
    data: [record],
    columns: buildTutoringSessionColumns({
      ...actions,
      canManage,
      isMarking: false,
      locale: 'en',
      policy: STANDARD_TUTORING_POLICY,
      t,
      tableT,
    }),
    state: { pagination: { pageIndex: 0, pageSize: 10 } },
  });
  return (
    <table>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <td key={cell.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
const view = (canManage: boolean, record = session) => (
  <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
    <ScheduleRow canManage={canManage} record={record} />
  </NextIntlClientProvider>
);
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('schedule lesson content', () => {
  it.each([false, true])(
    'opens the full read-only text with canManage=%s',
    async (canManage) => {
      render(view(canManage));
      fireEvent.click(
        screen.getByRole('button', { name: 'View full content' })
      );
      const dialog = await screen.findByRole('dialog');
      expect(
        within(dialog).getByText(content, { normalizer: (value) => value })
          .textContent
      ).toBe(content);
      expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();
      expect(
        within(dialog).queryByRole('button', { name: 'Save content' })
      ).not.toBeInTheDocument();
      expect(dialog.querySelector('script')).toBeNull();
      for (const action of Object.values(actions))
        expect(action).not.toHaveBeenCalled();
    }
  );

  it.each([false, true])(
    'preserves the edit action boundary with canManage=%s',
    async (canManage) => {
      render(view(canManage));
      fireEvent.keyDown(screen.getByRole('button', { name: 'Actions' }), {
        key: 'Enter',
      });
      const edit = await screen.findByRole('menuitem', {
        name: 'Edit lesson content',
      });
      if (canManage) {
        expect(edit).not.toHaveAttribute('data-disabled');
        fireEvent.click(edit);
        expect(actions.onEditContent).toHaveBeenCalledExactlyOnceWith(session);
      } else {
        expect(edit).toHaveAttribute('data-disabled');
        fireEvent.keyDown(edit, { key: 'Enter' });
        expect(actions.onEditContent).not.toHaveBeenCalled();
      }
      expect(actions.onDelete).not.toHaveBeenCalled();
      expect(actions.onMark).not.toHaveBeenCalled();
      expect(actions.onParentMessage).not.toHaveBeenCalled();
    }
  );

  it('closes the old content when a table row is replaced by another session', async () => {
    const result = render(view(false));
    fireEvent.click(screen.getByRole('button', { name: 'View full content' }));
    await screen.findByRole('dialog');
    const next = {
      ...session,
      id: 'synthetic-next-session',
      content: 'Different lesson',
    };
    result.rerender(view(false, next));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View full content' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Different lesson')).toBeInTheDocument();
    expect(dialog).not.toHaveTextContent('First lesson line.');
  });

  it.each(['', '  \n  '])('has no empty-content dialog for %j', (empty) => {
    render(view(false, { ...session, content: empty }));
    expect(
      screen.queryByRole('button', { name: 'View full content' })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
