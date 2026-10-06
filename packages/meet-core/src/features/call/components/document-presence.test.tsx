// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  Y,
} from '@tuturuuu/realtime/documents';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import {
  DocumentPresence,
  readDocumentCollaborators,
} from './document-presence';

const docs: Y.Doc[] = [];
const states: Awareness[] = [];
function awareness() {
  const doc = new Y.Doc();
  const value = new Awareness(doc);
  docs.push(doc);
  states.push(value);
  return value;
}
afterEach(() => {
  cleanup();
  for (const value of states.splice(0)) value.destroy();
  for (const doc of docs.splice(0)) doc.destroy();
});
function user(value: Awareness, id: string, name: string) {
  value.setLocalStateField('user', { id, name });
}
function relay(from: Awareness, to: Awareness) {
  applyAwarenessUpdate(
    to,
    encodeAwarenessUpdate(from, [from.clientID]),
    'test'
  );
}
function view(value: Awareness, connected = true) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <DocumentPresence awareness={value} connected={connected} />
    </NextIntlClientProvider>
  );
}
it('tracks actual document awareness, renames and departure without meeting roster inference', () => {
  const local = awareness();
  const remote = awareness();
  user(local, 'local', 'Local');
  user(remote, 'remote', 'Remote');
  render(view(local));
  expect(screen.queryByLabelText('Remote')).toBeNull();
  act(() => relay(remote, local));
  expect(screen.getByLabelText('Remote')).toBeDefined();
  act(() => {
    user(remote, 'remote', 'Renamed');
    relay(remote, local);
  });
  expect(screen.queryByLabelText('Remote')).toBeNull();
  expect(screen.getByLabelText('Renamed')).toBeDefined();
  act(() => {
    remote.setLocalState(null);
    relay(remote, local);
  });
  expect(screen.queryByLabelText('Renamed')).toBeNull();
});
it('deduplicates clients and rejects malformed identities and names', () => {
  const local = awareness();
  const duplicate = awareness();
  const invalid = awareness();
  user(local, 'same', 'Same');
  user(duplicate, 'same', 'Same');
  relay(duplicate, local);
  invalid.setLocalStateField('user', { id: 'bad', name: 42 });
  relay(invalid, local);
  expect(readDocumentCollaborators(local)).toEqual([
    { id: 'same', name: 'Same' },
  ]);
  invalid.setLocalStateField('user', { id: ' ', name: 'Private' });
  relay(invalid, local);
  expect(readDocumentCollaborators(local)).toHaveLength(1);
});
it('drops old provider identities on swap and suppresses disconnected roster', () => {
  const old = awareness();
  const next = awareness();
  user(old, 'old', 'Old');
  user(next, 'new', 'New');
  const { rerender } = render(view(old));
  expect(screen.getByLabelText('Old')).toBeDefined();
  rerender(view(next));
  expect(screen.queryByLabelText('Old')).toBeNull();
  expect(screen.getByLabelText('New')).toBeDefined();
  act(() => user(old, 'old', 'Late old'));
  expect(screen.queryByLabelText('Late old')).toBeNull();
  rerender(view(next, false));
  expect(screen.queryByRole('list')).toBeNull();
  act(() => user(next, 'new', 'Updated'));
  rerender(view(next));
  expect(screen.getByLabelText('Updated')).toBeDefined();
});
it('bounds displayed avatars without losing total or accessible overflow names', () => {
  const local = awareness();
  for (let i = 0; i < 6; i++) {
    const remote = awareness();
    user(remote, `person-${i}`, `Person ${i}`);
    relay(remote, local);
  }
  render(view(local));
  expect(screen.getByRole('list').getAttribute('aria-label')).toBe(
    '6 people in this document'
  );
  expect(screen.getByText('+2').getAttribute('title')).toBe(
    'Person 4, Person 5'
  );
});
