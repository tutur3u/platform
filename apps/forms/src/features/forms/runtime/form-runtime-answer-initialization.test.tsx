import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestFormDefinition } from '../test-support/form-fixtures';
import { FormRuntime } from './form-runtime';

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

vi.mock('@tuturuuu/turnstile/client', () => ({
  resolveTurnstileClientState: () => ({
    siteKey: undefined,
    isRequired: false,
    canRenderWidget: false,
  }),
}));

const baseForm = createTestFormDefinition();
const form = {
  ...baseForm,
  settings: {
    ...baseForm.settings,
    autoAdvance: false,
    displayMode: 'sections' as const,
    welcomeEnabled: false,
  },
  sections: [
    {
      id: 'answers-section',
      title: 'Answers',
      description: '',
      image: { storagePath: '', url: '', alt: '' },
      questions: ['first', 'second'].map((id) => ({
        id,
        sectionId: 'answers-section',
        type: 'short_text' as const,
        title: id,
        description: '',
        required: false,
        image: { storagePath: '', url: '', alt: '' },
        settings: { placeholder: id },
        options: [],
      })),
    },
  ],
};
const draftKey = `tuturuuu_form_draft_${form.id}`;
const first = () => screen.getByPlaceholderText('first');
const second = () => screen.getByPlaceholderText('second');
const storedAnswers = () =>
  JSON.parse(localStorage.getItem(draftKey) ?? '{}').answers;
const saveDraft = (answers: Record<string, string>) =>
  localStorage.setItem(
    draftKey,
    JSON.stringify({
      answers,
      currentSectionId: 'answers-section',
      sectionTrail: ['answers-section'],
    })
  );
const submit = () =>
  fireEvent.click(
    screen.getByRole('button', { name: 'runtime.submit_response' })
  );

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('rendered form answer initialization', () => {
  it('keeps restored answers in view, storage and submission through StrictMode replay', async () => {
    saveDraft({ first: 'Saved answer' });
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <StrictMode>
        <FormRuntime form={form} mode="public" onSubmit={onSubmit} />
      </StrictMode>
    );
    await waitFor(() => {
      expect(first()).toHaveValue('Saved answer');
      expect(storedAnswers()).toEqual({ first: 'Saved answer' });
    });
    submit();
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        answers: { first: 'Saved answer' },
        turnstileToken: undefined,
        sendResponseCopy: false,
      })
    );
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('merges a saved draft over the initial baseline only on mount', async () => {
    saveDraft({ first: 'Draft wins' });
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <FormRuntime
        form={form}
        mode="public"
        onSubmit={onSubmit}
        initialAnswers={{ first: 'Server baseline', second: 'Kept baseline' }}
      />
    );
    await waitFor(() => {
      expect(first()).toHaveValue('Draft wins');
      expect(second()).toHaveValue('Kept baseline');
      expect(storedAnswers()).toEqual({
        first: 'Draft wins',
        second: 'Kept baseline',
      });
    });
    submit();
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        answers: { first: 'Draft wins', second: 'Kept baseline' },
        turnstileToken: undefined,
        sendResponseCopy: false,
      })
    );
  });

  it('replaces new initial props, removes omitted answers, and clears empty or undefined props', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const renderForm = (initialAnswers?: Record<string, string>) => (
      <FormRuntime
        form={form}
        mode="public"
        onSubmit={onSubmit}
        initialAnswers={initialAnswers}
      />
    );
    const { rerender } = render(
      renderForm({ first: 'Old', second: 'Remove me' })
    );
    rerender(renderForm({ first: 'Replacement' }));
    expect(first()).toHaveValue('Replacement');
    expect(second()).toHaveValue('');
    expect(storedAnswers()).toEqual({ first: 'Replacement' });
    rerender(renderForm({}));
    expect(first()).toHaveValue('');
    expect(storedAnswers()).toEqual({});
    rerender(renderForm({ first: 'Clear again' }));
    rerender(renderForm(undefined));
    expect(first()).toHaveValue('');
    expect(second()).toHaveValue('');
    expect(storedAnswers()).toEqual({});
    submit();
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        answers: {},
        turnstileToken: undefined,
        sendResponseCopy: false,
      })
    );
  });

  it('retains user edits when the same initial answer object is rerendered', async () => {
    const initialAnswers = { first: 'Baseline' };
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <FormRuntime
        form={form}
        mode="public"
        initialAnswers={initialAnswers}
        onSubmit={onSubmit}
      />
    );
    fireEvent.change(first(), { target: { value: 'User edit' } });
    rerender(
      <FormRuntime
        form={form}
        mode="public"
        initialAnswers={initialAnswers}
        onSubmit={onSubmit}
        className="rerendered"
      />
    );
    expect(first()).toHaveValue('User edit');
    expect(storedAnswers()).toEqual({ first: 'User edit' });
    submit();
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        answers: { first: 'User edit' },
        turnstileToken: undefined,
        sendResponseCopy: false,
      })
    );
  });

  for (const gate of ['preview', 'readOnly', 'submittedAt'] as const) {
    it(`preserves supplied response answers and storage when ${gate} blocks drafts`, () => {
      saveDraft({ first: 'Private draft' });
      const saved = localStorage.getItem(draftKey);
      const props = {
        mode: gate === 'preview' ? ('preview' as const) : ('public' as const),
        readOnly: gate === 'readOnly',
        submittedAt:
          gate === 'submittedAt' ? '2026-01-01T00:00:00Z' : undefined,
      };
      const { rerender } = render(
        <FormRuntime
          form={form}
          {...props}
          initialAnswers={{ first: 'Response' }}
        />
      );
      expect(first()).toHaveValue('Response');
      expect(localStorage.getItem(draftKey)).toBe(saved);
      rerender(
        <FormRuntime
          form={form}
          {...props}
          initialAnswers={{ second: 'Replacement' }}
        />
      );
      expect(first()).toHaveValue('');
      expect(second()).toHaveValue('Replacement');
      expect(localStorage.getItem(draftKey)).toBe(saved);
    });
  }

  it('suspends draft saving during submission and resumes with current answers', () => {
    const { rerender } = render(<FormRuntime form={form} mode="public" />);
    fireEvent.change(first(), { target: { value: 'Saved' } });
    const saved = localStorage.getItem(draftKey);
    rerender(<FormRuntime form={form} mode="public" isSubmitting />);
    rerender(
      <FormRuntime
        form={form}
        mode="public"
        isSubmitting
        initialAnswers={{ first: 'Latest' }}
      />
    );
    expect(first()).toHaveValue('Latest');
    expect(localStorage.getItem(draftKey)).toBe(saved);
    rerender(
      <FormRuntime
        form={form}
        mode="public"
        initialAnswers={{ first: 'Latest' }}
      />
    );
    expect(storedAnswers()).toEqual({ first: 'Latest' });
  });

  for (const saved of [null, 'invalid JSON']) {
    it(`keeps the initial baseline and functional edits with ${saved === null ? 'no' : 'malformed'} draft`, () => {
      if (saved !== null) localStorage.setItem(draftKey, saved);
      const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        render(
          <FormRuntime
            form={form}
            mode="public"
            initialAnswers={{ first: 'Baseline' }}
          />
        );
        expect(first()).toHaveValue('Baseline');
        fireEvent.change(first(), { target: { value: 'Current edit' } });
        expect(first()).toHaveValue('Current edit');
        expect(storedAnswers()).toEqual({ first: 'Current edit' });
        if (saved !== null) expect(warning).toHaveBeenCalled();
      } finally {
        warning.mockRestore();
      }
    });
  }
});
