import { act, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeElement } from '../testing/fixtures';
import {
  createMemoryAssets,
  createMemoryPersistence,
} from '../testing/memory-adapters';
import type { WhiteboardEditorHandle } from './notices';

const canvas = vi.hoisted(() => ({
  props: null as null | Record<string, any>,
  api: {
    getSceneElements: vi.fn(() => [] as unknown[]),
    getAppState: vi.fn(() => ({ viewBackgroundColor: '#fff', gridSize: null })),
    getFiles: vi.fn(() => ({})),
    updateScene: vi.fn(),
    addFiles: vi.fn(),
  },
}));

vi.mock('./excalidraw-canvas', () => ({
  default: (props: Record<string, any>) => {
    canvas.props = props;
    props.excalidrawAPI(canvas.api);
    return <div data-testid="canvas" />;
  },
}));

const { WhiteboardEditor } = await import('./whiteboard-editor');

describe('WhiteboardEditor', () => {
  beforeEach(() => {
    canvas.props = null;
    vi.clearAllMocks();
  });
  afterEach(() => vi.useRealTimers());

  it('lazy-loads the canvas after mount and forwards theme and view mode', async () => {
    render(<WhiteboardEditor theme="dark" readOnly fallback={<i>wait</i>} />);

    expect(await screen.findByTestId('canvas')).toBeTruthy();
    expect(canvas.props).toMatchObject({
      theme: 'dark',
      viewModeEnabled: true,
      isCollaborating: false,
    });
  });

  it('offers image uploads only when assets are injected', async () => {
    const { rerender } = render(<WhiteboardEditor theme="light" />);
    await screen.findByTestId('canvas');
    expect(canvas.props?.generateIdForFile).toBeUndefined();

    rerender(<WhiteboardEditor theme="light" assets={createMemoryAssets()} />);
    await screen.findByTestId('canvas');
    expect(
      await canvas.props?.generateIdForFile(new File(['x'], 'a.png'))
    ).toMatch(/a\.png$/);
  });

  it('auto-saves changed elements through the persistence adapter', async () => {
    const persistence = createMemoryPersistence();
    const save = vi.spyOn(persistence, 'save');
    const onChange = vi.fn();
    const element = makeElement('a');
    canvas.api.getSceneElements.mockReturnValue([element]);

    render(
      <WhiteboardEditor
        theme="light"
        persistence={persistence}
        onChange={onChange}
        autoSaveDebounceMs={20}
      />
    );
    await screen.findByTestId('canvas');

    vi.useFakeTimers();
    act(() => {
      canvas.props?.onChange([element], {
        scrollX: 0,
        scrollY: 0,
        zoom: { value: 1 },
      });
    });
    expect(onChange).toHaveBeenCalledOnce();
    expect(save).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30);
    });

    expect(save).toHaveBeenCalledOnce();
    expect(save.mock.calls[0]?.[0]).toMatchObject({
      elements: [{ id: 'a' }],
      appState: { viewBackgroundColor: '#fff' },
    });
  });

  it('saves immediately through the imperative handle and reports status', async () => {
    const persistence = createMemoryPersistence();
    const save = vi.spyOn(persistence, 'save');
    const ref = createRef<WhiteboardEditorHandle>();
    const onStatusChange = vi.fn();

    render(
      <WhiteboardEditor
        ref={ref}
        theme="light"
        persistence={persistence}
        onStatusChange={onStatusChange}
      />
    );
    await screen.findByTestId('canvas');

    await act(async () => {
      await ref.current?.save();
    });

    expect(save).toHaveBeenCalledOnce();
    expect(onStatusChange).toHaveBeenLastCalledWith({
      syncStatus: 'synced',
      lastSyncError: null,
      isConnected: false,
    });
  });

  it('raises a save-failed notice with a working retry', async () => {
    const persistence = createMemoryPersistence();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const save = vi
      .spyOn(persistence, 'save')
      .mockRejectedValueOnce(new Error('nope'));
    const onNotify = vi.fn();
    const ref = createRef<WhiteboardEditorHandle>();

    render(
      <WhiteboardEditor
        ref={ref}
        theme="light"
        persistence={persistence}
        onNotify={onNotify}
      />
    );
    await screen.findByTestId('canvas');

    await act(async () => {
      await ref.current?.save();
    });

    const notice = onNotify.mock.calls[0]?.[0];
    expect(notice).toMatchObject({ kind: 'save-failed', message: 'nope' });

    await act(async () => {
      notice.retry();
    });
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('applies a newer stored snapshot on load while nothing is unsaved', async () => {
    const persistence = createMemoryPersistence();
    await persistence.save({ elements: [makeElement('remote')] });

    render(<WhiteboardEditor theme="light" persistence={persistence} />);
    await screen.findByTestId('canvas');

    await vi.waitFor(() =>
      expect(canvas.api.updateScene).toHaveBeenCalledWith({
        elements: [expect.objectContaining({ id: 'remote' })],
      })
    );
  });

  it('restores the remembered viewport', async () => {
    const storage = {
      getItem: vi.fn(() => '{"scrollX":5,"scrollY":6,"zoom":{"value":2}}'),
      setItem: vi.fn(),
    };

    render(
      <WhiteboardEditor
        theme="light"
        viewportStorageKey="k"
        viewportStorage={storage}
        initialData={{ elements: [] }}
      />
    );
    await screen.findByTestId('canvas');

    expect(storage.getItem).toHaveBeenCalledWith('k');
    expect(canvas.props?.initialData.appState).toMatchObject({
      scrollX: 5,
      scrollY: 6,
      zoom: { value: 2 },
    });
  });
});
