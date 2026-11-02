import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TutoringCreateSlots } from './tutoring-create-slots';
import { TutoringTeacherPicker } from './tutoring-teacher-picker';
import { DEFAULT_FORM } from './tutoring-types';

const state = vi.hoisted(() => ({
  locked: false,
  needsConfig: false,
  eligible: false,
  config: null as any,
  props: null as any,
  next: vi.fn(),
  request: vi.fn(),
  pages: [
    {
      data: [
        {
          id: 'other-class-teacher',
          full_name: 'Center Teacher',
          display_name: null,
          isTutor: false,
          isClassTeacher: true,
        },
        {
          id: 'tutor',
          full_name: 'Student Tutor',
          display_name: null,
          isTutor: true,
          isClassTeacher: false,
        },
        {
          id: 'both',
          full_name: 'Lecturer Tutor',
          display_name: null,
          isTutor: true,
          isClassTeacher: true,
        },
      ],
      page: 1,
      totalPages: 2,
    },
  ],
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: { data: state.eligible ? [{ id: 'tutor', isTutor: true }] : [] },
  }),
  useInfiniteQuery: (config: unknown) => {
    state.config = config;
    return {
      data: {
        pages: state.pages.map((page) => ({
          ...page,
          tutorsOnlyLocked: state.locked,
          tutorGroupConfigMissing: state.needsConfig,
        })),
      },
      hasNextPage: true,
      isFetchingNextPage: false,
      fetchNextPage: state.next,
    };
  },
}));
vi.mock('@tuturuuu/internal-api/tutoring', () => ({
  listTutoringTeachers: state.request,
}));
vi.mock('@tuturuuu/ui/hooks/use-debounce', () => ({
  useDebounce: (value: string) => [value],
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@tuturuuu/ui/custom/combobox', () => ({
  Combobox: (props: any) => {
    state.props = props;
    return (
      <>
        <button type="button" onClick={() => props.onSearchChange('Center')}>
          Search
        </button>
        <button
          type="button"
          onClick={() => props.onChange('other-class-teacher')}
        >
          Choose
        </button>
        <button type="button" onClick={props.onLoadMore}>
          More
        </button>
        <ul>
          {props.options.map((option: any) => (
            <li key={option.value}>
              {option.label}
              {option.badge ? ` [${option.badge}]` : ''}
            </li>
          ))}
        </ul>
      </>
    );
  },
}));

describe('center teacher picker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.locked = false;
    state.needsConfig = false;
    state.eligible = false;
  });
  it('uses the eligible teacher catalog, paginates, and clears search after selection', () => {
    const change = vi.fn();
    render(
      <TutoringTeacherPicker
        knownOptions={[{ value: 'homeroom', label: 'Homeroom Teacher' }]}
        onChange={change}
        value=""
        wsId="center"
      />
    );
    expect(screen.getByText('Center Teacher [teacher]')).toBeInTheDocument();
    expect(screen.queryByText('Homeroom Teacher')).not.toBeInTheDocument();
    void state.config.queryFn({ pageParam: 2 });
    expect(state.request).toHaveBeenCalledWith('center', {
      page: 2,
      pageSize: 20,
      q: undefined,
      tutorsOnly: true,
    });
    expect(state.config.getNextPageParam({ page: 1, totalPages: 2 })).toBe(2);
    expect(
      state.config.getNextPageParam({ page: 2, totalPages: 2 })
    ).toBeUndefined();
    fireEvent.click(screen.getByText('More'));
    expect(state.next).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByText('Search'));
    expect(state.config.queryKey).toEqual([
      'tutoring-teachers',
      'center',
      'Center',
      true,
    ]);
    fireEvent.click(screen.getByText('Choose'));
    expect(change).toHaveBeenCalledWith('other-class-teacher');
    expect(state.config.queryKey).toEqual([
      'tutoring-teachers',
      'center',
      '',
      true,
    ]);
  });

  it('labels tutors, class teachers and people who are both', () => {
    render(<TutoringTeacherPicker onChange={vi.fn()} value="" wsId="center" />);
    expect(screen.getByText('Center Teacher [teacher]')).toBeInTheDocument();
    expect(screen.getByText('Student Tutor [tutor]')).toBeInTheDocument();
    expect(
      screen.getByText('Lecturer Tutor [tutor · teacher]')
    ).toBeInTheDocument();
  });

  it('starts with tutors only and explicitly requests all teachers when toggled off', () => {
    render(<TutoringTeacherPicker onChange={vi.fn()} value="" wsId="center" />);
    const toggle = screen.getByRole('switch', { name: 'tutors_only' });
    expect(toggle).toBeChecked();
    void state.config.queryFn({ pageParam: 1 });
    expect(state.request).toHaveBeenLastCalledWith('center', {
      page: 1,
      pageSize: 20,
      q: undefined,
      tutorsOnly: true,
    });
    fireEvent.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(state.config.queryKey).toEqual([
      'tutoring-teachers',
      'center',
      '',
      false,
    ]);
    void state.config.queryFn({ pageParam: 1 });
    expect(state.request).toHaveBeenCalledWith('center', {
      page: 1,
      pageSize: 20,
      q: undefined,
      tutorsOnly: false,
    });
  });

  it('flag ON hides the toggle and excludes other teachers including a saved selection', () => {
    state.locked = true;
    const change = vi.fn();
    render(
      <TutoringTeacherPicker
        onChange={change}
        value="other-class-teacher"
        knownOptions={[
          { value: 'other-class-teacher', label: 'Saved teacher' },
        ]}
        wsId="center"
      />
    );
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Center Teacher [teacher]')
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Saved teacher')).not.toBeInTheDocument();
    expect(change).toHaveBeenCalledWith('');
    expect(screen.getByRole('status')).toHaveTextContent(
      'non_tutor_selection_cleared'
    );
    expect(screen.getByText('Student Tutor [tutor]')).toBeInTheDocument();
    expect(
      screen.getByText('Lecturer Tutor [tutor · teacher]')
    ).toBeInTheDocument();
  });
  it('locks an already toggled all-teacher picker when flag metadata changes', () => {
    const { rerender } = render(
      <TutoringTeacherPicker onChange={vi.fn()} value="" wsId="center" />
    );
    fireEvent.click(screen.getByRole('switch'));
    state.locked = true;
    rerender(
      <TutoringTeacherPicker onChange={vi.fn()} value="" wsId="center" />
    );
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Center Teacher [teacher]')
    ).not.toBeInTheDocument();
    expect(screen.getByText('Student Tutor [tutor]')).toBeInTheDocument();
    void state.config.queryFn({ pageParam: 1 });
    expect(state.request).toHaveBeenLastCalledWith(
      'center',
      expect.objectContaining({ tutorsOnly: true })
    );
  });
  it('hides the toggle and offers a configuration hint when groups are unset', () => {
    state.needsConfig = true;
    render(<TutoringTeacherPicker onChange={vi.fn()} value="" wsId="center" />);
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.getByText('configure_tutor_group')).toBeInTheDocument();
  });
  it('preserves an eligible tutor selected outside the visible search page', () => {
    state.locked = true;
    state.eligible = true;
    const change = vi.fn();
    render(
      <TutoringTeacherPicker onChange={change} value="tutor" wsId="center" />
    );
    expect(change).not.toHaveBeenCalled();
  });
  it('keeps each slot picker toggle independent when several render', () => {
    render(
      <>
        <TutoringTeacherPicker onChange={vi.fn()} value="" wsId="center" />
        <TutoringTeacherPicker onChange={vi.fn()} value="" wsId="center" />
      </>
    );
    const toggles = screen.getAllByRole('switch', { name: 'tutors_only' });
    expect(toggles).toHaveLength(2);
    expect(toggles[0]?.id).not.toBe(toggles[1]?.id);
    fireEvent.click(screen.getAllByText('tutors_only')[1] as HTMLElement);
    expect(toggles[1]).not.toBeChecked();
    expect(toggles[0]).toBeChecked();
  });
});

it.each(['plan button', 'add-slot prefill', 'weekly-slot prefill'])(
  'clears a non-tutor from %s and disables submit',
  (source) => {
    state.locked = true;
    function Form() {
      const [value, setValue] = useState('other-class-teacher');
      return (
        <>
          <TutoringTeacherPicker
            value={value}
            onChange={setValue}
            wsId="center"
          />
          <button type="submit" disabled={!value}>
            {source}
          </button>
        </>
      );
    }
    render(<Form />);
    expect(screen.getByRole('button', { name: source })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(
      'non_tutor_selection_cleared'
    );
  }
);

it.each(['add_session_slot', 'add_weekly_slot'])(
  'clears the sole class-manager prefill from %s',
  (action) => {
    state.locked = true;
    function Form() {
      const [form, setForm] = useState({
        ...DEFAULT_FORM,
        groupId: 'class',
        sessionSlots: [
          {
            sessionDate: '2026-11-03',
            startTime: '18:00',
            durationMinutes: 45,
            teacherUserId: '',
          },
        ],
      });
      return (
        <>
          <TutoringCreateSlots
            conflictingIndexes={new Set()}
            form={form}
            onChange={setForm}
            singleTeacherId="other-class-teacher"
            teacherOptions={[]}
            wsId="center"
          />
          <div data-testid="assignments">
            {JSON.stringify(
              form.sessionSlots.map((slot) => slot.teacherUserId)
            )}
          </div>
        </>
      );
    }
    render(<Form />);
    fireEvent.click(screen.getByRole('button', { name: action }));
    expect(screen.getByTestId('assignments')).toHaveTextContent('["",""]');
    expect(screen.getByRole('status')).toHaveTextContent(
      'non_tutor_selection_cleared'
    );
  }
);
