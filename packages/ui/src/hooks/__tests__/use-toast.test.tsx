import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sonner = vi.hoisted(() => {
  const toast = Object.assign(vi.fn(), {
    error: vi.fn(),
    dismiss: vi.fn(),
  });
  return { toast };
});

vi.mock('sonner', () => ({ toast: sonner.toast }));

import { toast, useToast } from '../use-toast';

const repoRoot = existsSync(resolve(process.cwd(), 'packages/ui/package.json'))
  ? process.cwd()
  : resolve(process.cwd(), '../..');

describe('legacy use-toast forwards to Sonner', () => {
  beforeEach(() => {
    sonner.toast.mockClear();
    sonner.toast.error.mockClear();
    sonner.toast.dismiss.mockClear();
  });

  it('shows a default toast with its title and description', () => {
    const handle = toast({ title: 'Saved', description: 'All changes kept' });

    expect(sonner.toast).toHaveBeenCalledWith('Saved', {
      id: handle.id,
      description: 'All changes kept',
      action: undefined,
    });
    expect(sonner.toast.error).not.toHaveBeenCalled();
  });

  it('maps the destructive variant to an error toast', () => {
    const handle = toast({
      title: 'Could not save',
      description: 'Try again',
      variant: 'destructive',
    });

    expect(sonner.toast.error).toHaveBeenCalledWith('Could not save', {
      id: handle.id,
      description: 'Try again',
      action: undefined,
    });
    expect(sonner.toast).not.toHaveBeenCalled();
  });

  it('uses the description as the message when there is no title', () => {
    toast({ description: 'Copied' });

    expect(sonner.toast).toHaveBeenCalledWith(
      'Copied',
      expect.objectContaining({ description: undefined })
    );
  });

  it('updates the same Sonner toast and dismisses it by id', () => {
    const handle = toast({ title: 'Uploading' });
    handle.update({ id: handle.id, title: 'Uploaded' });

    expect(sonner.toast).toHaveBeenLastCalledWith(
      'Uploaded',
      expect.objectContaining({ id: handle.id })
    );

    handle.dismiss();
    expect(sonner.toast.dismiss).toHaveBeenCalledWith(handle.id);
  });

  it('gives useToast callers the forwarding toast and no legacy stack', () => {
    const { result } = renderHook(() => useToast());

    expect(result.current.toasts).toEqual([]);
    result.current.toast({ title: 'From hook' });
    expect(sonner.toast).toHaveBeenCalledWith('From hook', expect.any(Object));

    result.current.dismiss();
    expect(sonner.toast.dismiss).toHaveBeenCalledWith(undefined);
  });
});

function layoutFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) return [];
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return layoutFiles(path);
    return entry.name === 'layout.tsx' ? [path] : [];
  });
}

describe('toast mounting', () => {
  it('mounts exactly one Sonner Toaster in each web app root layout', () => {
    const inactive = new Set(['tanstack-web', 'backend', 'mobile']);
    const appsDir = resolve(repoRoot, 'apps');
    const offenders: string[] = [];

    for (const app of readdirSync(appsDir)) {
      if (inactive.has(app)) continue;
      const rootLayout = resolve(appsDir, app, 'src/app/[locale]/layout.tsx');
      if (!existsSync(rootLayout)) continue;

      const source = readFileSync(rootLayout, 'utf8');
      const mounts = source.match(/<Toaster\b/gu)?.length ?? 0;
      if (mounts > 0 && !source.includes("'@tuturuuu/ui/sonner'")) {
        offenders.push(`${app}: Toaster is not the shared Sonner one`);
      }
      if (mounts > 1) offenders.push(`${app}: ${mounts} Toaster mounts`);
    }

    for (const file of layoutFiles(appsDir)) {
      const path = relative(repoRoot, file);
      if ([...inactive].some((app) => path.startsWith(`apps/${app}/`))) {
        continue;
      }
      if (readFileSync(file, 'utf8').includes("'@tuturuuu/ui/toaster'")) {
        offenders.push(`${path}: mounts the legacy Radix Toaster`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
