import { fireEvent, render, screen } from '@testing-library/react';
import { LAUNCHABLE_APPS } from '@tuturuuu/utils/launchable-apps';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import vi from '../../../messages/vi.json';
import { EcosystemDirectory } from './portfolio-directory';

describe('portfolio ecosystem directory', () => {
  it('covers every registered application in both languages', () => {
    for (const app of LAUNCHABLE_APPS) {
      expect(en.portfolio.directory).toHaveProperty(`${app.slug}.description`);
      expect(vi.portfolio.directory).toHaveProperty(`${app.slug}.description`);
    }
  });
  it('filters domains without losing the full catalog', () => {
    const apps = LAUNCHABLE_APPS.map((app) => ({
      ...app,
      url: app.productionUrl,
      description: app.title,
    }));
    render(<EcosystemDirectory apps={apps} copy={en.portfolio} />);
    expect(screen.getAllByRole('link')).toHaveLength(apps.length);
    fireEvent.click(
      screen.getByRole('button', { name: /Learning & development/ })
    );
    expect(screen.getAllByRole('link')).toHaveLength(
      apps.filter((app) => app.category === 'learning').length
    );
    expect(screen.queryByRole('heading', { name: 'Tasks' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /All applications/ }));
    expect(screen.getByRole('heading', { name: 'Tasks' })).toBeDefined();
  });
});
