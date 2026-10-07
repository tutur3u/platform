import { fireEvent, render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import {
  type ReportDraftValues,
  useReportDraftSync,
} from './use-report-draft-sync';

const initial = {
  title: 'Monthly review',
  content: 'Lesson observations',
  feedback: 'Next steps',
};
function Editor({
  scope = ['workspace', 'report', 'student', 'group'],
  values = initial,
}: {
  scope?: string[];
  values?: ReportDraftValues;
}) {
  const form = useForm<ReportDraftValues>({ defaultValues: values });
  useReportDraftSync(form, scope, values);
  return (
    <form>
      {(['title', 'content', 'feedback'] as const).map((name) => (
        <input key={name} aria-label={name} {...form.register(name)} />
      ))}
      <output data-testid="dirty">{String(form.formState.isDirty)}</output>
      <output data-testid="dirty-fields">
        {JSON.stringify(form.formState.dirtyFields)}
      </output>
    </form>
  );
}
function edit(name: string, value: string) {
  fireEvent.change(screen.getByLabelText(name), { target: { value } });
}
describe('monthly report draft refresh', () => {
  it('retains an edited observation while an unchanged field refreshes', () => {
    const view = render(<Editor />);
    edit('content', 'Teacher draft in progress');
    view.rerender(
      <Editor values={{ ...initial, feedback: 'Updated next steps' }} />
    );
    expect(screen.getByLabelText('content')).toHaveValue(
      'Teacher draft in progress'
    );
    expect(screen.getByLabelText('feedback')).toHaveValue('Updated next steps');
    expect(screen.getByTestId('dirty')).toHaveTextContent('true');
  });
  it('retains independent edits during a conflicting refresh', () => {
    const view = render(<Editor />);
    edit('title', 'Draft title');
    edit('content', 'Draft content');
    edit('feedback', 'Draft feedback');
    view.rerender(
      <Editor
        values={{
          title: 'Other title',
          content: 'Other content',
          feedback: 'Other feedback',
        }}
      />
    );
    expect(screen.getByLabelText('title')).toHaveValue('Draft title');
    expect(screen.getByLabelText('content')).toHaveValue('Draft content');
    expect(screen.getByLabelText('feedback')).toHaveValue('Draft feedback');
  });
  it('updates clean fields from the authoritative refresh', () => {
    const view = render(<Editor />);
    view.rerender(<Editor values={{ ...initial, content: 'Saved update' }} />);
    expect(screen.getByLabelText('content')).toHaveValue('Saved update');
    expect(screen.getByTestId('dirty')).toHaveTextContent('false');
  });
  it('clears dirty state when the server acknowledges the exact draft', () => {
    const view = render(<Editor />);
    edit('content', 'Saved draft');
    view.rerender(<Editor values={{ ...initial, content: 'Saved draft' }} />);
    expect(screen.getByLabelText('content')).toHaveValue('Saved draft');
    expect(screen.getByTestId('dirty')).toHaveTextContent('false');
  });
  it('preserves an intentionally cleared field during refresh', () => {
    const view = render(<Editor />);
    edit('feedback', '');
    view.rerender(
      <Editor values={{ ...initial, content: 'New observation' }} />
    );
    expect(screen.getByLabelText('feedback')).toHaveValue('');
    expect(screen.getByLabelText('content')).toHaveValue('New observation');
    expect(screen.getByTestId('dirty')).toHaveTextContent('true');
  });
  it('retains edits across identical and successive refreshes', () => {
    const view = render(<Editor />);
    edit('content', 'Draft observation');
    view.rerender(<Editor values={{ ...initial }} />);
    view.rerender(<Editor values={{ ...initial, feedback: 'First update' }} />);
    edit('title', 'Draft title');
    view.rerender(
      <Editor values={{ ...initial, feedback: 'Second update' }} />
    );
    expect(screen.getByLabelText('content')).toHaveValue('Draft observation');
    expect(screen.getByLabelText('title')).toHaveValue('Draft title');
    expect(screen.getByLabelText('feedback')).toHaveValue('Second update');
  });
  it.each([0, 1, 2, 3])(
    'clears the prior draft when scope element %i changes',
    (index) => {
      const scope = ['workspace', 'report', 'student', 'group'];
      const view = render(<Editor scope={scope} />);
      edit('content', 'Private prior draft');
      const nextScope = [...scope];
      nextScope[index] = 'different';
      view.rerender(
        <Editor
          scope={nextScope}
          values={{ ...initial, content: 'New scoped report' }}
        />
      );
      expect(screen.getByLabelText('content')).toHaveValue('New scoped report');
      expect(screen.getByTestId('dirty')).toHaveTextContent('false');
    }
  );
});
