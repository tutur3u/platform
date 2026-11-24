import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import ModifiableDialogTrigger from './modifiable-dialog-trigger';

interface FormProps {
  data?: unknown;
  onFinish?: () => void;
}

function ExampleForm({ onFinish }: FormProps) {
  return (
    <form>
      <label htmlFor="example-name">Name</label>
      <input id="example-name" />
      <button type="button" onClick={onFinish}>
        Save
      </button>
    </form>
  );
}

// The shape React Flight uses for an element whose client module is loading.
function flightLazyNode(read: () => ReactElement) {
  return {
    $$typeof: Symbol.for('react.lazy'),
    _payload: null,
    _init: read,
  } as unknown as ReactElement<FormProps>;
}

function renderTrigger(form: ReactElement<FormProps>) {
  return render(
    <ModifiableDialogTrigger
      title="Create"
      trigger={<button type="button">Open</button>}
      form={form}
    />
  );
}

describe('ModifiableDialogTrigger', () => {
  it('renders an element form and closes the dialog when it finishes', async () => {
    renderTrigger(<ExampleForm />);

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(await screen.findByLabelText('Name')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders a form delivered as a resolved RSC lazy node', async () => {
    renderTrigger(flightLazyNode(() => <ExampleForm />));

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(await screen.findByLabelText('Name')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('suspends on a pending RSC lazy node until its module loads', async () => {
    let element: ReactElement | null = null;
    let resolve = () => {};
    const pending = new Promise<void>((done) => {
      resolve = () => {
        element = <ExampleForm />;
        done();
      };
    });
    const read = vi.fn(() => {
      if (!element) throw pending;
      return element;
    });

    renderTrigger(flightLazyNode(read));
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    expect(await screen.findByRole('dialog')).toBeVisible();
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();

    await act(async () => {
      resolve();
      await pending;
    });
    expect(await screen.findByLabelText('Name')).toBeVisible();
  });
});
