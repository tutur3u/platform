import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import messages from '../../../../../messages/en.json';
import { WorkflowInspector } from '../workflow-inspector';

const node = {
  data: {
    config: {
      message: 'Revision {{steps.context.output.revision}}',
    },
    label: 'Log summary',
  },
  id: 'log',
  position: { x: 100, y: 100 },
  type: 'log' as const,
};

function renderInspector(isAdmin: boolean, onChange = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <WorkflowInspector
        isAdmin={isAdmin}
        node={node}
        onChange={onChange}
        onDelete={vi.fn()}
        validationErrors={[]}
      />
    </NextIntlClientProvider>
  );
}

describe('WorkflowInspector', () => {
  it('renders selected node config in read-only mode for members', () => {
    renderInspector(false);

    expect(screen.getByText('Log summary')).toBeTruthy();
    expect(screen.getByText('Read-only workflow')).toBeTruthy();
    expect(
      (screen.getByLabelText('Node label') as HTMLInputElement).disabled
    ).toBe(true);
    expect(
      (screen.getByDisplayValue(/Revision/) as HTMLTextAreaElement).disabled
    ).toBe(true);
  });

  it('lets admins edit labels and config JSON', () => {
    const onChange = vi.fn();
    renderInspector(true, onChange);

    fireEvent.change(screen.getByLabelText('Node label'), {
      target: { value: 'Trace message' },
    });

    expect(onChange).toHaveBeenCalledWith('log', {
      data: expect.objectContaining({
        label: 'Trace message',
      }),
    });
  });

  it('renders validation errors near the selected node', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <WorkflowInspector
          isAdmin
          node={node}
          onChange={vi.fn()}
          onDelete={vi.fn()}
          validationErrors={['Workflow graphs cannot contain cycles.']}
        />
      </NextIntlClientProvider>
    );

    expect(screen.getByText('Graph needs attention')).toBeTruthy();
    expect(
      screen.getByText('Workflow graphs cannot contain cycles.')
    ).toBeTruthy();
  });
});
