import { expect, it } from 'vitest';
import * as Y from 'yjs';
import { keepSelection } from './selection';

// Replaces `old` with `next` the way the format action does: one transaction.
function rewrite(text: Y.Text, next: string, from: number, to: number) {
  text.doc?.transact(() => {
    text.delete(from, to - from);
    text.insert(from, next);
  }, 'format');
}
function setup(content: string) {
  const doc = new Y.Doc();
  const text = doc.getText('t');
  text.insert(0, content);
  return text;
}

it('keeps a caret after the changed span on the same text', () => {
  const text = setup('let  a=1\nfoo()\n');
  // The caret sits right after "foo".
  const caret = 'let  a=1\nfoo'.length;
  const kept = keepSelection(text, { anchor: caret, head: caret }, () =>
    rewrite(text, 'let a = 1;', 0, 'let  a=1'.length)
  );
  expect(text.toString()).toBe('let a = 1;\nfoo()\n');
  const moved = 'let a = 1;\nfoo'.length;
  expect(kept).toEqual({ anchor: moved, head: moved });
  expect(text.toString().slice(moved, moved + 2)).toBe('()');
});

it('keeps a selection that lies wholly after the span, both ends', () => {
  const text = setup('x=1\nfoo(bar)\n');
  const start = 'x=1\nfoo('.length;
  const kept = keepSelection(text, { anchor: start, head: start + 3 }, () =>
    rewrite(text, 'x = 1', 0, 3)
  );
  expect(kept).not.toBeNull();
  expect(text.toString().slice(kept!.anchor, kept!.head)).toBe('bar');
});

it('leaves a caret before the span where it is', () => {
  const text = setup('abc\nx=1\n');
  const kept = keepSelection(text, { anchor: 2, head: 2 }, () =>
    rewrite(text, 'x = 1', 'abc\n'.length, 'abc\nx=1'.length)
  );
  expect(kept).toEqual({ anchor: 2, head: 2 });
});

it('puts an end inside the replaced span on its edge, never beyond the file', () => {
  const text = setup('x=1\nfoo\n');
  const kept = keepSelection(text, { anchor: 1, head: 2 }, () =>
    rewrite(text, 'x = 1', 0, 3)
  );
  expect(kept!.anchor).toBeGreaterThanOrEqual(0);
  expect(kept!.head).toBeLessThanOrEqual(text.length);
  // Neither end moved past the rewritten span.
  expect(kept!.anchor).toBeLessThanOrEqual('x = 1'.length);
  expect(kept!.head).toBeLessThanOrEqual('x = 1'.length);
});

it('runs the edit even with nothing to keep', () => {
  const text = setup('x=1\n');
  expect(
    keepSelection(text, null, () => rewrite(text, 'x = 1', 0, 3))
  ).toBeNull();
  expect(text.toString()).toBe('x = 1\n');
});
