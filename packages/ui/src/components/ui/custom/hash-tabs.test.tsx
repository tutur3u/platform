import '@testing-library/jest-dom';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { useSyncExternalStore } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HashTabs } from './hash-tabs';

const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'tracks', label: 'Tracks' },
  { id: 'activity', label: 'Activity' },
];
const panels = {
  overview: <p>Overview body</p>,
  tracks: <p>Tracks body</p>,
  activity: <p>Activity body</p>,
};
const ids = tabs.map((tab) => tab.id);

const subscribe = (notify: () => void) => {
  window.addEventListener('hashchange', notify);
  return () => window.removeEventListener('hashchange', notify);
};

/** The owner: the selected tab is a pure function of location.hash. */
function UrlTabs() {
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => ''
  );
  const id = hash.slice(1);
  return (
    <HashTabs
      label="Sections"
      tabs={tabs}
      value={ids.includes(id) ? id : 'overview'}
      onValueChange={(next, source) => {
        if (source === 'keyboard')
          window.history.replaceState(null, '', `#${next}`);
        else window.history.pushState(null, '', `#${next}`);
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      }}
      panels={panels}
    />
  );
}

const selected = () =>
  screen
    .getAllByRole('tab')
    .find((tab) => tab.getAttribute('aria-selected') === 'true')?.textContent;

beforeEach(() => window.history.replaceState(null, '', '/'));
afterEach(() => window.history.replaceState(null, '', '/'));

describe('HashTabs', () => {
  it('renders every panel and an anchor per tab in the server HTML', () => {
    const html = renderToString(
      <HashTabs
        label="Sections"
        tabs={tabs}
        value="activity"
        onValueChange={() => {}}
        panels={panels}
      />
    );
    for (const body of ['Overview body', 'Tracks body', 'Activity body'])
      expect(html).toContain(body);
    for (const id of ids) expect(html).toContain(`href="#${id}"`);
    // Before hydration the first tab is selected whatever the owner passes.
    expect(html).toMatch(
      /aria-selected="true"[^>]*>Overview|>Overview<[^]*?aria-selected="true"/
    );
  });

  it('selects the tab the URL fragment names, and falls back to the first', () => {
    window.history.replaceState(null, '', '/#tracks');
    const { unmount } = render(<UrlTabs />);
    expect(selected()).toBe('Tracks');
    unmount();
    window.history.replaceState(null, '', '/#nope');
    render(<UrlTabs />);
    expect(selected()).toBe('Overview');
  });

  it('writes the fragment on click and follows back and forward', () => {
    render(<UrlTabs />);
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Activity' }));
    expect(window.location.hash).toBe('#activity');
    expect(selected()).toBe('Activity');
    act(() => {
      window.history.replaceState(null, '', '/#tracks');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(selected()).toBe('Tracks');
  });

  it('does not intercept modified clicks', () => {
    render(<UrlTabs />);
    const link = screen.getByRole('tab', { name: 'Tracks' });
    const plain = fireEvent.click(link);
    expect(plain).toBe(false);
    const modified = fireEvent.click(link, { ctrlKey: true });
    expect(modified).toBe(true);
  });

  it('moves with the arrow keys and Home/End, replacing the entry', async () => {
    render(<UrlTabs />);
    const first = screen.getByRole('tab', { name: 'Overview' });
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    await waitFor(() => expect(selected()).toBe('Tracks'));
    expect(window.location.hash).toBe('#tracks');
    fireEvent.keyDown(document.activeElement as Element, { key: 'End' });
    await waitFor(() => expect(selected()).toBe('Activity'));
  });

  it('links each panel to its tab', () => {
    render(<UrlTabs />);
    const panel = screen.getByRole('tabpanel', { name: 'Overview' });
    expect(panel).toHaveAttribute('id', 'overview');
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
      'aria-controls',
      'overview'
    );
    expect(document.getElementById('tracks')).toHaveAttribute(
      'data-state',
      'inactive'
    );
  });
});
