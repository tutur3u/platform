import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatFile } from './file-preview-chips';
import { useMiraMessageQueue } from './use-mira-message-queue';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function file(id: string): ChatFile {
  return {
    id,
    file: new File(['x'], id),
    status: 'uploaded',
    previewUrl: null,
    storagePath: id,
    signedUrl: null,
  };
}
function fixture(
  overrides: Partial<Parameters<typeof useMiraMessageQueue>[0]> = {}
) {
  const params = {
    attachedFiles: [] as ChatFile[],
    chatId: 'chat',
    clearAttachedFiles: vi.fn(),
    createChat: vi.fn().mockResolvedValue(undefined),
    sendMessageWithCurrentConfig: vi.fn().mockResolvedValue(true),
    snapshotAttachmentsForMessage: vi.fn(),
    status: 'ready',
    stop: vi.fn(),
    ...overrides,
  };
  return {
    params,
    ...renderHook((props) => useMiraMessageQueue(props), {
      initialProps: params,
    }),
  };
}
async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500);
  });
}

describe('Mira queued turn continuation admission', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it('batches ordered distinct text once and retains existing dedup behavior', async () => {
    const f = fixture();
    act(() => {
      f.result.current.handleSubmit(' first ');
      f.result.current.handleSubmit('second');
      f.result.current.handleSubmit('first');
    });
    await flush();
    expect(f.params.sendMessageWithCurrentConfig).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(f.params.sendMessageWithCurrentConfig).mock.calls[0]?.[0].parts
    ).toEqual([{ type: 'text', text: 'first\n\nsecond' }]);
    expect(f.params.clearAttachedFiles).toHaveBeenCalledTimes(1);
  });
  it('keeps upload-only submission and disabled pause/resume semantics', async () => {
    const f = fixture({ attachedFiles: [file('one')] });
    act(() => f.result.current.handleSubmit(''));
    f.rerender({ ...f.params, disabled: true });
    await flush();
    expect(f.params.sendMessageWithCurrentConfig).not.toHaveBeenCalled();
    f.rerender({ ...f.params, disabled: false });
    await act(async () => {});
    expect(f.params.sendMessageWithCurrentConfig).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(f.params.sendMessageWithCurrentConfig).mock.calls[0]?.[0]
        .parts[0].text
    ).toBe('Please analyze the attached file(s).');
  });
  it('stops a busy response then flushes at most once when ready', async () => {
    const f = fixture({ status: 'streaming' });
    act(() => f.result.current.handleSubmit('next'));
    expect(f.params.stop).toHaveBeenCalledTimes(1);
    f.rerender({ ...f.params, status: 'ready' });
    await act(async () => {});
    await flush();
    expect(f.params.sendMessageWithCurrentConfig).toHaveBeenCalledTimes(1);
  });
  for (const boundary of ['reset', 'unmount']) {
    it(`held send after ${boundary} cannot clear composer attachments`, async () => {
      const held = deferred<boolean>();
      const f = fixture({
        attachedFiles: [file('old')],
        sendMessageWithCurrentConfig: vi.fn(() => held.promise),
      });
      act(() => f.result.current.handleSubmit('hello'));
      await flush();
      if (boundary === 'reset') act(() => f.result.current.resetQueue());
      else f.unmount();
      await act(async () => {
        held.resolve(true);
        await held.promise;
      });
      expect(f.params.clearAttachedFiles).not.toHaveBeenCalled();
    });
  }
  it('held successful send leaves newer attachments untouched', async () => {
    const held = deferred<boolean>();
    const old = file('old');
    const f = fixture({
      attachedFiles: [old],
      sendMessageWithCurrentConfig: vi.fn(() => held.promise),
    });
    act(() => f.result.current.handleSubmit('hello'));
    await flush();
    f.rerender({ ...f.params, attachedFiles: [old, file('new')] });
    await act(async () => {
      held.resolve(true);
      await held.promise;
    });
    expect(f.params.clearAttachedFiles).not.toHaveBeenCalled();
  });
  it('superseded create receives a predicate that rejects late callbacks', async () => {
    const held = deferred<void>();
    const create = vi.fn(
      (_text: string, _current?: () => boolean) => held.promise
    );
    const f = fixture({ chatId: undefined, createChat: create });
    act(() => f.result.current.handleSubmit('hello'));
    await flush();
    const current = create.mock.calls[0]?.[1];
    expect(current?.()).toBe(true);
    act(() => f.result.current.resetQueue());
    expect(current?.()).toBe(false);
    await act(async () => {
      held.resolve();
      await held.promise;
    });
    expect(f.params.clearAttachedFiles).not.toHaveBeenCalled();
  });
  it('false create result never clears attachments or automatically retries', async () => {
    const f = fixture({
      chatId: undefined,
      attachedFiles: [file('old')],
      createChat: vi.fn().mockResolvedValue(false),
    });
    act(() => f.result.current.handleSubmit('hello'));
    await flush();
    await flush();
    expect(f.params.clearAttachedFiles).not.toHaveBeenCalled();
    expect(f.params.createChat).toHaveBeenCalledTimes(1);
  });
  for (const aba of [false, true]) {
    it(`held send is fenced across chat identity ${aba ? 'ABA' : 'switch'}`, async () => {
      const held = deferred<boolean>();
      const f = fixture({
        attachedFiles: [file('old')],
        sendMessageWithCurrentConfig: vi.fn(() => held.promise),
      });
      act(() => f.result.current.handleSubmit('hello'));
      await flush();
      f.rerender({ ...f.params, chatId: 'other' });
      if (aba) f.rerender(f.params);
      await act(async () => {
        held.resolve(true);
        await held.promise;
      });
      expect(f.params.clearAttachedFiles).not.toHaveBeenCalled();
    });
    it(`pending debounce is dropped across chat identity ${aba ? 'ABA' : 'switch'}`, async () => {
      const f = fixture();
      act(() => f.result.current.handleSubmit('old prompt'));
      f.rerender({ ...f.params, chatId: 'other' });
      if (aba) f.rerender(f.params);
      await flush();
      expect(f.params.sendMessageWithCurrentConfig).not.toHaveBeenCalled();
      expect(f.params.createChat).not.toHaveBeenCalled();
      expect(f.result.current.queuedText).toBeNull();
      act(() => f.result.current.handleSubmit('new prompt'));
      await flush();
      expect(f.params.sendMessageWithCurrentConfig).toHaveBeenCalledTimes(1);
      expect(
        vi.mocked(f.params.sendMessageWithCurrentConfig).mock.calls[0]?.[0]
          .parts
      ).toEqual([{ type: 'text', text: 'new prompt' }]);
    });
  }
  it('its explicitly bound created chat preserves the pending create continuation', async () => {
    const held = deferred<boolean>();
    const create = vi.fn(
      (
        _text: string,
        _current?: () => boolean,
        _onCreated?: (id: string) => void
      ) => held.promise
    );
    const f = fixture({
      chatId: undefined,
      attachedFiles: [file('old')],
      createChat: create,
    });
    act(() => f.result.current.handleSubmit('hello'));
    await flush();
    const current = create.mock.calls[0]?.[1];
    const onCreated = create.mock.calls[0]?.[2];
    expect(onCreated).toEqual(expect.any(Function));
    onCreated?.('created');
    onCreated?.('different');
    f.rerender({ ...f.params, chatId: 'created' });
    expect(current?.()).toBe(true);
    await act(async () => {
      held.resolve(true);
      await held.promise;
    });
    expect(f.params.clearAttachedFiles).toHaveBeenCalledTimes(1);
  });

  it('an arbitrary undefined to other chat transition rejects held creation', async () => {
    const held = deferred<boolean>();
    const create = vi.fn(
      (
        _text: string,
        _current?: () => boolean,
        _onCreated?: (id: string) => void
      ) => held.promise
    );
    const f = fixture({ chatId: undefined, createChat: create });
    act(() => f.result.current.handleSubmit('hello'));
    await flush();
    f.rerender({ ...f.params, chatId: 'other' });
    expect(create.mock.calls[0]?.[1]?.()).toBe(false);
    create.mock.calls[0]?.[2]?.('other');
    await act(async () => {
      held.resolve(true);
      await held.promise;
    });
    expect(f.params.clearAttachedFiles).not.toHaveBeenCalled();
  });
});
