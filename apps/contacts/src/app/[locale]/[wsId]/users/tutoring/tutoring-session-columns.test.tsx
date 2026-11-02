import { fireEvent, render, screen } from '@testing-library/react';
import type { TutoringSessionRecord } from '@tuturuuu/internal-api';
import { EASY_CENTER_TUTORING_POLICY } from '@tuturuuu/internal-api/tutoring-policy';
import { describe, expect, it, vi } from 'vitest';
import {
  buildTutoringSessionColumns,
  type TutoringSessionColumnActions,
} from './tutoring-session-columns';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: any) =>
    values
      ? `translated_${key}_${JSON.stringify(values)}`
      : `translated_${key}`,
}));

vi.mock('@tuturuuu/ui/custom/tables/data-table-column-header', () => ({
  DataTableColumnHeader: ({ title }: any) => <div>{title}</div>,
}));

vi.mock('@tuturuuu/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: any) => (
    <div data-testid="dropdown">{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: any) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick, disabled }: any) => (
    <button disabled={disabled} onClick={onClick} type="button">
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
}));

describe('buildTutoringSessionColumns', () => {
  const sampleActions: TutoringSessionColumnActions = {
    canManage: true,
    isMarking: false,
    locale: 'en',
    policy: {
      ...EASY_CENTER_TUTORING_POLICY,
      campusByGroupId: {
        'grp-1': 'District 1 Campus',
      },
    },
    onEditContent: vi.fn(),
    onDelete: vi.fn(),
    onMark: vi.fn(),
    onParentMessage: vi.fn(),
    t: ((key: string, values?: any) =>
      values
        ? `translated_${key}_${JSON.stringify(values)}`
        : `translated_${key}`) as any,
    tableT: ((key: string) => `translated_table_${key}`) as any,
  };

  const sampleSession: TutoringSessionRecord = {
    id: 'session-123',
    session_date: '2026-11-03',
    start_time: '14:00',
    end_time: '15:00',
    duration_minutes: 60,
    attendance_status: 'PENDING',
    reason_type: 'WEAK_SUPPORT',
    group_id: 'grp-1',
    content: 'Review quadratic equations',
    content_linked: true,
    student: {
      id: 'student-1',
      display_name: 'Nguyen Van A',
    },
    teacher: {
      id: 'teacher-1',
      display_name: 'Tran Thi B',
    },
    group: {
      id: 'grp-1',
      name: 'Class 10A',
    },
  } as unknown as TutoringSessionRecord;

  it('builds seven table columns with headers and cells', () => {
    const columns = buildTutoringSessionColumns(sampleActions);
    expect(columns).toHaveLength(7);
  });

  it('renders student, teacher, and campus cells correctly', () => {
    const columns = buildTutoringSessionColumns(sampleActions);
    const row = { original: sampleSession } as any;

    const studentCol = columns.find((c) => c.id === 'student')!;
    const teacherCol = columns.find((c) => c.id === 'teacher')!;
    const campusCol = columns.find((c) => c.id === 'campus')!;

    render(
      <div>
        <div data-testid="student-cell">
          {studentCol.cell?.({ row } as any)}
        </div>
        <div data-testid="teacher-cell">
          {teacherCol.cell?.({ row } as any)}
        </div>
        <div data-testid="campus-cell">{campusCol.cell?.({ row } as any)}</div>
      </div>
    );

    expect(screen.getByText('Nguyen Van A')).toBeInTheDocument();
    expect(screen.getByText('Class 10A')).toBeInTheDocument();
    expect(screen.getByText('Tran Thi B')).toBeInTheDocument();
    expect(screen.getByText('District 1 Campus')).toBeInTheDocument();
  });

  it('renders quick mark_done button for pending session and triggers onMark', () => {
    const columns = buildTutoringSessionColumns(sampleActions);
    const actionsCol = columns.find((c) => c.id === 'actions')!;
    const row = { original: sampleSession } as any;

    render(<div>{actionsCol.cell?.({ row } as any)}</div>);

    const markDoneButtons = screen.getAllByRole('button', {
      name: 'translated_mark_done',
    });
    expect(markDoneButtons[0]).toBeInTheDocument();

    fireEvent.click(markDoneButtons[0]!);
    expect(sampleActions.onMark).toHaveBeenCalledWith('session-123', 'DONE');
  });

  it('omits quick mark_done button when session is already done', () => {
    const columns = buildTutoringSessionColumns(sampleActions);
    const actionsCol = columns.find((c) => c.id === 'actions')!;
    const row = {
      original: { ...sampleSession, attendance_status: 'DONE' },
    } as any;

    render(<div>{actionsCol.cell?.({ row } as any)}</div>);

    const markDoneButtons = screen.getAllByRole('button', {
      name: 'translated_mark_done',
    });
    expect(markDoneButtons).toHaveLength(1);
    expect(markDoneButtons[0]).toBeDisabled();
  });

  it('renders reason badge, content, and linked badge in reason_type column', () => {
    const columns = buildTutoringSessionColumns(sampleActions);
    const reasonCol = columns.find(
      (c) => (c as any).accessorKey === 'reason_type'
    )!;
    const row = { original: sampleSession } as any;

    render(<div>{reasonCol.cell?.({ row } as any)}</div>);

    expect(screen.getByText('Review quadratic equations')).toBeInTheDocument();
    expect(
      screen.getByText('translated_content_linked_badge')
    ).toBeInTheDocument();
  });
});
