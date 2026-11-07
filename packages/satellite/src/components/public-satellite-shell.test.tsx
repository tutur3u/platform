// @vitest-environment node

import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PublicSatelliteProviders, PublicSatelliteShell } from '../public';

vi.mock('next/headers', () => {
  throw new Error('Public SSR must not import request cookies or headers');
});
vi.mock('../auth', () => {
  throw new Error('Public SSR must not import satellite authentication');
});
vi.mock('@tuturuuu/supabase', () => {
  throw new Error('Public SSR must not import Supabase');
});

function document() {
  return renderToString(
    <PublicSatelliteProviders>
      <PublicSatelliteShell
        appName="Roadmap"
        appHref="https://tuturuuu.com/roadmap/"
        homeHref="https://tuturuuu.com"
        navigationLabel="Navigation"
        signIn={{ href: 'https://tuturuuu.com/login', label: 'Sign in' }}
        LinkComponent={(props) => <a data-adapter="link" {...props} />}
        ImageComponent={({ alt, ...props }) => (
          <img data-adapter="image" alt={alt} {...props} />
        )}
      >
        <main>Public evidence</main>
      </PublicSatelliteShell>
    </PublicSatelliteProviders>
  );
}

describe('public satellite SSR', () => {
  it('renders identical public content repeatedly without resolving an actor', () => {
    const first = document();
    expect(first).toBe(document());
    expect(first).toContain('Public evidence');
    expect(first).toContain('data-adapter="link"');
    expect(first).toContain('data-adapter="image"');
    expect(first).toContain('https://tuturuuu.com/media/logos/transparent.png');
    expect(first).toContain('https://tuturuuu.com/login');
    expect(first).not.toContain('supabase');
  });

  it('keeps sign-in optional and does not mount account controls', () => {
    const html = renderToString(
      <PublicSatelliteShell
        appName="Public"
        appHref="/"
        homeHref="/"
        navigationLabel="Navigation"
      >
        <main>Public</main>
      </PublicSatelliteShell>
    );
    expect(html).not.toContain('/login');
    expect(html).not.toContain('Workspace');
  });
});
