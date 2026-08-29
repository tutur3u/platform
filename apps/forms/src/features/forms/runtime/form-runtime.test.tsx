import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestFormDefinition } from '../test-support/form-fixtures';
import type { FormDefinition, FormDefinitionQuestion } from '../types';
import { FormRuntime } from './form-runtime';

// Keys render as themselves, so assertions read against the key rather than
// English copy that translation churn would break.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@tuturuuu/icons', () => {
  const iconStub = (props: Record<string, unknown>) => <svg {...props} />;

  return new Proxy(
    { __esModule: true },
    {
      get: (target: Record<string, unknown>, property: string | symbol) => {
        if (typeof property !== 'string' || property === 'then') {
          return Reflect.get(target, property);
        }
        return property in target ? target[property] : iconStub;
      },
      has: (target: Record<string, unknown>, property: string | symbol) =>
        typeof property === 'string' && property !== 'then'
          ? true
          : Reflect.has(target, property),
      getOwnPropertyDescriptor: (
        target: Record<string, unknown>,
        property: string | symbol
      ) =>
        typeof property === 'string' && property !== 'then'
          ? { configurable: true, enumerable: true, value: iconStub }
          : Reflect.getOwnPropertyDescriptor(target, property),
    }
  );
});

const emptyImage = { storagePath: '', url: '', alt: '' };

function textQuestion(id: string, title: string): FormDefinitionQuestion {
  return {
    id,
    sectionId: 'section-1',
    type: 'short_text',
    title,
    description: '',
    required: false,
    image: emptyImage,
    settings: {},
    options: [],
  };
}

function choiceQuestion(id: string, title: string): FormDefinitionQuestion {
  return {
    ...textQuestion(id, title),
    type: 'single_choice',
    options: [
      { id: `${id}-a`, label: 'Alpha', value: 'alpha', image: emptyImage },
      { id: `${id}-b`, label: 'Beta', value: 'beta', image: emptyImage },
    ],
  };
}

function buildForm(
  questions: FormDefinitionQuestion[],
  settings: Partial<FormDefinition['settings']> = {}
): FormDefinition {
  const base = createTestFormDefinition();

  return {
    ...base,
    settings: {
      ...base.settings,
      autoAdvance: false,
      displayMode: 'one_question',
      welcomeEnabled: false,
      ...settings,
    },
    sections: [
      {
        id: 'section-1',
        title: 'Section one',
        description: '',
        image: emptyImage,
        questions,
      },
    ],
  };
}

describe('FormRuntime in one-question mode', () => {
  it('shows one question at a time rather than the whole section', () => {
    render(
      <FormRuntime
        form={buildForm([
          textQuestion('q1', 'First question'),
          textQuestion('q2', 'Second question'),
        ])}
        mode="public"
      />
    );

    expect(screen.getByText('First question')).toBeDefined();
    expect(screen.queryByText('Second question')).toBeNull();
  });

  it('advances to the next question on Enter', () => {
    render(
      <FormRuntime
        form={buildForm([
          textQuestion('q1', 'First question'),
          textQuestion('q2', 'Second question'),
        ])}
        mode="public"
      />
    );

    // Bound on document, so it works without focusing anything first — the
    // difference between keyboard-navigable and keyboard-tolerant.
    fireEvent.keyDown(document, { key: 'Enter' });

    expect(screen.getByText('Second question')).toBeDefined();
    expect(screen.queryByText('First question')).toBeNull();
  });

  it('goes back with Alt+ArrowUp', () => {
    render(
      <FormRuntime
        form={buildForm([
          textQuestion('q1', 'First question'),
          textQuestion('q2', 'Second question'),
        ])}
        mode="public"
      />
    );

    fireEvent.keyDown(document, { key: 'Enter' });
    expect(screen.getByText('Second question')).toBeDefined();

    fireEvent.keyDown(document, { key: 'ArrowUp', altKey: true });
    expect(screen.getByText('First question')).toBeDefined();
  });

  it('renders every question at once in sections mode', () => {
    render(
      <FormRuntime
        form={buildForm(
          [
            textQuestion('q1', 'First question'),
            textQuestion('q2', 'Second question'),
          ],
          { displayMode: 'sections' }
        )}
        mode="public"
      />
    );

    expect(screen.getByText('First question')).toBeDefined();
    expect(screen.getByText('Second question')).toBeDefined();
  });

  it('does not advance on Enter in sections mode', () => {
    // With a whole section on screen, Enter would carry the respondent past
    // questions they have not reached.
    render(
      <FormRuntime
        form={buildForm(
          [
            textQuestion('q1', 'First question'),
            textQuestion('q2', 'Second question'),
          ],
          { displayMode: 'sections' }
        )}
        mode="public"
      />
    );

    fireEvent.keyDown(document, { key: 'Enter' });

    expect(screen.getByText('First question')).toBeDefined();
  });

  it('picks an option with its letter shortcut', () => {
    render(
      <FormRuntime
        form={buildForm([
          choiceQuestion('q1', 'Pick one'),
          textQuestion('q2', 'Second question'),
        ])}
        mode="public"
      />
    );

    fireEvent.keyDown(document, { key: 'b' });

    const beta = screen.getByRole('radio', { name: /Beta/ });
    expect(beta.getAttribute('aria-checked')).toBe('true');
  });

  it('renders the welcome screen before the first question when enabled', () => {
    render(
      <FormRuntime
        form={buildForm([textQuestion('q1', 'First question')], {
          welcomeEnabled: true,
        })}
        mode="public"
      />
    );

    // Asserting the start button, not just the question's absence: a runtime
    // that rendered nothing at all would satisfy the absence on its own, so
    // the negative assertion alone proves nothing.
    expect(
      screen.getByRole('button', { name: 'runtime.welcome_start' })
    ).toBeDefined();
    expect(screen.queryByText('First question')).toBeNull();
  });

  it('renders nothing for a form with no sections', () => {
    // The guard that keeps every hook in the runtime unconditional.
    const form = { ...createTestFormDefinition(), sections: [] };
    const { container } = render(<FormRuntime form={form} mode="public" />);

    expect(container.firstChild).toBeNull();
  });
});

describe('auto-advance', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function renderChoiceForm(autoAdvance: boolean) {
    return render(
      <FormRuntime
        form={buildForm(
          [
            choiceQuestion('q1', 'Pick one'),
            textQuestion('q2', 'Second question'),
          ],
          { autoAdvance }
        )}
        mode="public"
      />
    );
  }

  it('moves on shortly after a single choice is picked', () => {
    renderChoiceForm(true);

    fireEvent.click(screen.getByRole('radio', { name: /Alpha/ }));
    expect(screen.getByText('Pick one')).toBeDefined();

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(screen.getByText('Second question')).toBeDefined();
  });

  it('does not move on when the author turned it off', () => {
    renderChoiceForm(false);

    fireEvent.click(screen.getByRole('radio', { name: /Alpha/ }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText('Pick one')).toBeDefined();
  });

  it('advances once when the answer is changed several times', () => {
    // Three questions, not two: with two, a duplicate advance would land on
    // the terminal question and the assertions would pass anyway. The third
    // is what makes a second advance observable.
    render(
      <FormRuntime
        form={buildForm(
          [
            choiceQuestion('q1', 'Pick one'),
            textQuestion('q2', 'Second question'),
            textQuestion('q3', 'Third question'),
          ],
          { autoAdvance: true }
        )}
        mode="public"
      />
    );

    fireEvent.click(screen.getByRole('radio', { name: /Alpha/ }));
    act(() => {
      vi.advanceTimersByTime(300);
    });
    // The first timer's original deadline passes here without firing, because
    // changing the answer rescheduled it rather than queueing a second one.
    fireEvent.click(screen.getByRole('radio', { name: /Beta/ }));
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.getByText('Pick one')).toBeDefined();

    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByText('Second question')).toBeDefined();

    // A surviving second timer would carry straight on to the third.
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByText('Second question')).toBeDefined();
    expect(screen.queryByText('Third question')).toBeNull();
  });

  it('does not advance from a free-text answer', () => {
    render(
      <FormRuntime
        form={buildForm(
          [
            textQuestion('q1', 'Type here'),
            textQuestion('q2', 'Second question'),
          ],
          { autoAdvance: true }
        )}
        mode="public"
      />
    );

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'partial answ' } });

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Leaving mid-sentence is the failure this guard exists for.
    expect(screen.getByText('Type here')).toBeDefined();
  });
});

describe('layout', () => {
  function renderWithLayout(layout: 'page' | 'inline') {
    return render(
      <FormRuntime
        form={buildForm([textQuestion('q1', 'First question')])}
        layout={layout}
        mode="public"
      />
    );
  }

  it('claims the viewport on the hosted page', () => {
    const { container } = renderWithLayout('page');
    expect(container.querySelector('.min-h-screen')).not.toBeNull();
  });

  it('does not claim the viewport when embedded', () => {
    // The bug this guards: the runtime kept `min-h-screen` inside the embed,
    // the studio preview and the landing demo. `EmbedFrame` measures this
    // subtree and posts the height to the host, so every embed reported at
    // least a full viewport no matter how little the form contained — and the
    // landing demo showed one short question above a screen of blank space.
    const { container } = renderWithLayout('inline');
    expect(container.querySelector('.min-h-screen')).toBeNull();
  });

  it('defaults to claiming the viewport', () => {
    // The hosted form is the common case and must not change silently.
    const { container } = render(
      <FormRuntime
        form={buildForm([textQuestion('q1', 'First question')])}
        mode="public"
      />
    );
    expect(container.querySelector('.min-h-screen')).not.toBeNull();
  });
});
