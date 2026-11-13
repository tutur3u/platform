import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Editor, Node, Mark } from '@tiptap/react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../messages/en.json';
import { ModuleWritingAssistant } from './module-writing-assistant';

const mocks = vi.hoisted(() => ({ review: vi.fn() }));
vi.mock('@tuturuuu/internal-api/education', () => ({
  reviewEducationDocument: (...args: unknown[]) => mocks.review(...args),
}));
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: keyof typeof messages.inlineAssistant) =>
    messages.inlineAssistant[key],
}));
const extensions = [
  Node.create({ name: 'doc', topNode: true, content: 'paragraph+' }),
  Node.create({
    name: 'paragraph',
    group: 'block',
    content: 'inline*',
    parseHTML: () => [{ tag: 'p' }],
    renderHTML: () => ['p', 0],
  }),
  Node.create({ name: 'text', group: 'inline' }),
  Mark.create({
    name: 'bold',
    parseHTML: () => [{ tag: 'strong' }],
    renderHTML: () => ['strong', 0],
  }),
];
let editor: Editor;
const finding = {
  id: 'agreement',
  from: 4,
  to: 6,
  original: 'go',
  explanation: 'Match the subject.',
  replacement: 'goes',
};
function mount() {
  editor = new Editor({
    extensions,
    content: '<p>She <strong>go</strong> home.</p>',
  });
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { mutations: { retry: false } } })
      }
    >
      <ModuleWritingAssistant
        editor={editor}
        wsId="workspace"
        courseId="course"
        moduleId="module"
      />
    </QueryClientProvider>
  );
}
function enable(level = 'full') {
  fireEvent.change(screen.getByLabelText('AI help level'), {
    target: { value: level },
  });
}
function review() {
  fireEvent.click(screen.getByRole('button', { name: 'Review draft' }));
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.review.mockResolvedValue({ suggestions: [finding] });
});
afterEach(() => {
  cleanup();
  editor?.destroy();
});

describe('teacher inline review', () => {
  it('defaults off and never transmits typing before explicit review', () => {
    mount();
    expect(
      screen
        .getByRole('button', { name: 'Review draft' })
        .hasAttribute('disabled')
    ).toBe(true);
    act(() => editor.commands.insertContent('Updated'));
    expect(mocks.review).not.toHaveBeenCalled();
    enable();
    expect(mocks.review).not.toHaveBeenCalled();
  });
  it('adds underlines, accepts through an editor transaction, and preserves marks', async () => {
    mount();
    enable();
    review();
    await screen.findByRole('button', { name: 'Accept' });
    expect(
      editor.view.dom.querySelector('[data-suggestion-id]')?.textContent
    ).toBe('go');
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(editor.getText()).toBe('She goes home.');
    expect(editor.getHTML()).toContain('<strong>goes</strong>');
  });
  it('renders provider replacement as literal text, never HTML', async () => {
    mocks.review.mockResolvedValue({
      suggestions: [
        { ...finding, replacement: '<img src=x onerror=alert(1)>' },
      ],
    });
    mount();
    enable();
    review();
    fireEvent.click(await screen.findByRole('button', { name: 'Accept' }));
    expect(editor.getText()).toContain('<img');
    expect(editor.view.dom.querySelector('img')).toBeNull();
  });
  it('dismisses without changing text and removes the underline', async () => {
    mount();
    enable();
    review();
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));
    expect(editor.getText()).toBe('She go home.');
    expect(editor.view.dom.querySelector('[data-suggestion-id]')).toBeNull();
  });
  it('never offers an answer replacement in hints mode', async () => {
    mount();
    enable('hints');
    review();
    await screen.findByText('Match the subject.');
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
    expect(mocks.review.mock.calls[0]?.[0]).toMatchObject({
      level: 'hints',
      subject: 'writing',
      locale: 'en',
    });
  });
  it('aborts pending review when off and rejects late results', async () => {
    let resolve!: (value: unknown) => void;
    mocks.review.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    mount();
    enable();
    review();
    await waitFor(() => expect(mocks.review).toHaveBeenCalledTimes(1));
    enable('off');
    expect(mocks.review.mock.calls[0]?.[1].aborted).toBe(true);
    await act(async () => resolve({ suggestions: [finding] }));
    expect(screen.queryByText('Match the subject.')).toBeNull();
  });
  it('clears stale results immediately and debounces edits', async () => {
    mount();
    enable();
    review();
    await screen.findByRole('button', { name: 'Accept' });
    act(() => editor.commands.insertContent('New '));
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
    expect(mocks.review).toHaveBeenCalledTimes(1);
    expect(editor.view.dom.querySelector('[data-suggestion-id]')).toBeNull();
  });
  it('offers retry after an error and reuses cached review for unchanged text', async () => {
    mocks.review.mockRejectedValueOnce(new Error('Denied'));
    mount();
    enable();
    review();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Try review again' })
    );
    await screen.findByRole('button', { name: 'Accept' });
    review();
    await screen.findByRole('button', { name: 'Accept' });
    expect(mocks.review).toHaveBeenCalledTimes(2);
  });
});
