import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(
  process.cwd(),
  process.cwd().endsWith('/packages/ui') ? '../..' : '.'
);

function readRepoFile(path: string) {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('@tuturuuu/ui public quickstart', () => {
  it('documents only executable public package entry points', () => {
    const readme = readRepoFile('packages/ui/README.md');
    const packageJson = JSON.parse(
      readRepoFile('packages/ui/package.json')
    ) as {
      exports: Record<string, unknown>;
    };

    expect(
      readme.match(/import '@tuturuuu\/ui\/globals\.css';/gu) ?? []
    ).toHaveLength(1);
    expect(readme).toContain("import { Button } from '@tuturuuu/ui/button';");
    expect(readme).toMatch(
      /import\s*\{[\s\S]*?Card[\s\S]*?CardContent[\s\S]*?CardHeader[\s\S]*?CardTitle[\s\S]*?\}\s*from '@tuturuuu\/ui\/card';/u
    );
    expect(readme).not.toMatch(/from ['"]@tuturuuu\/ui['"]/u);
    expect(readme).not.toContain('variant="primary"');
    expect(packageJson.exports['.']).toBeUndefined();
    expect(packageJson.exports['./button']).toBeDefined();
    expect(packageJson.exports['./*']).toBe('./src/components/ui/*.tsx');
  });

  it('renders the documented component tree through public subpaths', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Welcome to Tuturuuu</CardTitle>
        </CardHeader>
        <CardContent>
          <Button>Get started</Button>
        </CardContent>
      </Card>
    );

    expect(
      screen.getByRole('button', { name: 'Get started' })
    ).toBeInTheDocument();
    expect(screen.getByText('Welcome to Tuturuuu')).toBeInTheDocument();
  });
});
