// @vitest-environment jsdom

import { render, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DashboardNavigationIcon } from './navigation-icons';

describe('DashboardNavigationIcon', () => {
  it('renders a stable placeholder before the async icon registry resolves', async () => {
    const { container } = render(
      <DashboardNavigationIcon className="h-5 w-5" name="Archive" />
    );

    const placeholder = container.querySelector('span[aria-hidden]');
    expect(placeholder?.className).toContain('inline-block');
    expect(placeholder?.className).toContain('h-5');
    expect(placeholder?.className).toContain('w-5');

    await waitFor(() => {
      const svg = container.querySelector('svg');

      expect(svg).not.toBeNull();
      expect(svg?.getAttribute('class')).toContain('h-5');
      expect(svg?.getAttribute('class')).toContain('w-5');
    });
  });
});
