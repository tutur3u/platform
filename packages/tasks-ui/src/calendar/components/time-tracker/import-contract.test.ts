import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import PackageTimeTracker from '@tuturuuu/tasks-ui/calendar/components/time-tracker';
import { describe, expect, it } from 'vitest';
import RelativeTimeTracker from '../time-tracker';
import DirectoryTimeTracker from './index';

describe('time tracker import contract', () => {
  it('keeps the wildcard package entry as a component-free explicit re-export', async () => {
    const source = await readFile(
      resolve(process.cwd(), 'src/calendar/components/time-tracker.tsx'),
      'utf8'
    );

    expect(source.trim()).toBe(
      "export { default } from './time-tracker/index';"
    );
    expect(source).not.toContain('function TimeTracker');
    expect(source).not.toContain("from './time-tracker';");
  });

  it('resolves relative and package imports to the directory implementation', () => {
    expect(RelativeTimeTracker).toBe(DirectoryTimeTracker);
    expect(PackageTimeTracker).toBe(DirectoryTimeTracker);
  });
});
