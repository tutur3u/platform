import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const { input, change } = vi.hoisted(() => {
  const input: {
    onKeyDown?: (event: {
      key: string;
      keyCode: number;
      nativeEvent: { isComposing: boolean };
      preventDefault: () => void;
    }) => void;
  } = {};
  return { input, change: vi.fn() };
});

vi.mock('@tuturuuu/icons', () => ({ Plus: () => null, X: () => null }));
vi.mock('@tuturuuu/ui/button', () => ({ Button: () => null }));
vi.mock('@tuturuuu/ui/label', () => ({ Label: () => null }));
vi.mock('@tuturuuu/ui/input', () => ({
  Input: (props: typeof input) => {
    input.onKeyDown = props.onKeyDown;
    return null;
  },
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: () => ['model-id', vi.fn()],
}));

import { ModelListField } from './model-list-field';

function press(key: string, isComposing = false, keyCode = 13) {
  change.mockClear();
  renderToStaticMarkup(
    createElement(ModelListField, {
      addLabel: 'Add',
      emptyLabel: 'Empty',
      label: 'Models',
      placeholder: 'Model ID',
      removeLabel: 'Remove',
      value: [],
      onChange: change,
    })
  );
  const preventDefault = vi.fn();
  if (!input.onKeyDown) throw new Error('Input keyboard handler missing');
  input.onKeyDown({
    key,
    keyCode,
    nativeEvent: { isComposing },
    preventDefault,
  });
  return preventDefault;
}

describe('model policy identifier keyboard entry', () => {
  it.each(['Enter', ','])('commits an ID on %s outside composition', (key) => {
    expect(press(key)).toHaveBeenCalledOnce();
    expect(change).toHaveBeenCalledExactlyOnceWith(['model-id']);
  });
  it.each(['Enter', ','])('keeps the draft on %s during composition', (key) => {
    expect(press(key, true)).not.toHaveBeenCalled();
    expect(change).not.toHaveBeenCalled();
  });
  it('keeps Safari composition confirmation from committing an ID', () => {
    expect(press('Enter', false, 229)).not.toHaveBeenCalled();
    expect(change).not.toHaveBeenCalled();
  });
  it('leaves other keys to the input', () => {
    expect(press('a', false, 65)).not.toHaveBeenCalled();
    expect(change).not.toHaveBeenCalled();
  });
});
