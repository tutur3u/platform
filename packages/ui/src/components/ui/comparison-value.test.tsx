import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';
import { ComparisonValue } from './comparison-value';

it('keeps a status icon compact and reveals its wording and scope on tap', async () => {
  render(
    <ComparisonValue
      value="included"
      label="Included"
      context="Plus: Tasks"
      explanation="Within your workspace limits"
    />
  );
  const button = screen.getByRole('button', { name: 'Plus: Tasks: Included' });
  expect(button.textContent).toBe('');
  fireEvent.click(button);
  await waitFor(() =>
    expect(screen.getByRole('tooltip').textContent).toContain(
      'Within your workspace limits'
    )
  );
  fireEvent.keyDown(button, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
});
it('keeps numeric quotas visible instead of hiding the limit in an icon', () => {
  render(
    <ComparisonValue value="20 GiB" label="20 GiB" context="Plus: Drive" />
  );
  expect(
    screen.getByRole('button', { name: 'Plus: Drive: 20 GiB' }).textContent
  ).toBe('20 GiB');
});
