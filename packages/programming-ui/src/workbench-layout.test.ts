import { describe, expect, it } from 'vitest';
import {
  isRunActive,
  newFilePathError,
  outputView,
  previewPort,
  saveState,
} from './workbench-layout';

describe('newFilePathError', () => {
  it('accepts nested project paths and rejects traversal or duplicates', () => {
    expect(newFilePathError('src/main.py', ['main.py'])).toBeNull();
    expect(newFilePathError(' main.py ', ['main.py'])).toBe('duplicate');
    expect(newFilePathError('../secret', [])).toBe('invalid');
    expect(newFilePathError('a/./b', [])).toBe('invalid');
    expect(newFilePathError('', [])).toBe('invalid');
    expect(newFilePathError('bad name.py', [])).toBe('invalid');
  });
});

describe('previewPort', () => {
  it('only accepts unprivileged numeric ports', () => {
    expect(previewPort('3000')).toBe(3000);
    expect(previewPort(' 8080 ')).toBe(8080);
    expect(previewPort('80')).toBeNull();
    expect(previewPort('70000')).toBeNull();
    expect(previewPort('3000a')).toBeNull();
  });
});

describe('run and save state', () => {
  it('treats queued, running and cancel_requested as active', () => {
    expect(isRunActive('queued')).toBe(true);
    expect(isRunActive('cancel_requested')).toBe(true);
    expect(isRunActive('completed')).toBe(false);
    expect(isRunActive(undefined)).toBe(false);
  });
  it('prefers a failure over a saved revision', () => {
    expect(saveState(true, 4)).toBe('failed');
    expect(saveState(false, 4)).toBe('saved');
    expect(saveState(false, null)).toBe('idle');
  });
});

describe('outputView', () => {
  const run = {
    runId: 'r',
    status: 'completed',
    exitCode: 2,
    output: 'boom',
    revision: 1,
    saved: true,
  };
  it('shows run output with its exit code once the run finished', () => {
    expect(outputView(false, '', run)).toEqual({
      text: 'boom',
      exitCode: 2,
      running: false,
    });
  });
  it('hides the exit code while a run is active and before any run', () => {
    expect(outputView(false, '', { ...run, status: 'running' })).toEqual({
      text: 'boom',
      exitCode: null,
      running: true,
    });
    expect(outputView(false, '', undefined)).toEqual({
      text: '',
      exitCode: null,
      running: false,
    });
  });
  it('uses the public test output for Learn problems', () => {
    expect(outputView(true, 'passed 3/3', run)).toEqual({
      text: 'passed 3/3',
      exitCode: null,
      running: false,
    });
  });
});
