import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    displayMode: 'one_question' as const,
    welcomeEnabled: false,
  },
  sections: [
    {
      id: 'draft-section',
      title: 'Draft section',
      description: '',
      image: { storagePath: '', url: '', alt: '' },
      questions: [
        {
          id: 'draft-answer',
          sectionId: 'draft-section',
          type: 'short_text' as const,
          title: 'Your answer',
          description: '',
          required: true,
          image: { storagePath: '', url: '', alt: '' },
          settings: {},
          options: [],
        },
      ],
    },
  ],
};
const draftKey = `tuturuuu_form_draft_${form.id}`;

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('public form draft restoration', () => {
  it('restores an entered answer after remount and submits that answer', async () => {
    const firstRender = render(<FormRuntime form={form} mode="public" />);
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Saved before leaving' },
    });
    await waitFor(() => {
      expect(
        JSON.parse(localStorage.getItem(draftKey) ?? '{}').answers
      ).toEqual({
        'draft-answer': 'Saved before leaving',
      });
    });
    firstRender.unmount();

    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<FormRuntime form={form} mode="public" onSubmit={onSubmit} />);

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toHaveValue('Saved before leaving');
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'runtime.submit_response' })
    );
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit).toHaveBeenCalledWith({
        answers: { 'draft-answer': 'Saved before leaving' },
        turnstileToken: undefined,
        sendResponseCopy: false,
      });
    });
  });

  it('restores a previously saved draft without requiring initial answers', async () => {
    localStorage.setItem(
      draftKey,
      JSON.stringify({
        answers: { 'draft-answer': 'Previously saved' },
        currentSectionId: 'draft-section',
        sectionTrail: ['draft-section'],
      })
    );
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<FormRuntime form={form} mode="public" onSubmit={onSubmit} />);

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toHaveValue('Previously saved');
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'runtime.submit_response' })
    );
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit).toHaveBeenCalledWith({
        answers: { 'draft-answer': 'Previously saved' },
        turnstileToken: undefined,
        sendResponseCopy: false,
      });
    });
  });
});
