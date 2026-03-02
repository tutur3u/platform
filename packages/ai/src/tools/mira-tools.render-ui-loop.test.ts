import { describe, expect, it, vi } from 'vitest';
import { createMiraStreamTools, type MiraToolContext } from './mira-tools';

vi.mock('@tuturuuu/utils/constants', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tuturuuu/utils/constants')>();
  return {
    ...actual,
    DEV_MODE: true,
  };
});

const dummyCtx = {
  userId: 'user-1',
  wsId: 'ws-1',
  supabase: {} as MiraToolContext['supabase'],
  timezone: 'Asia/Saigon',
} satisfies MiraToolContext;

describe('mira-tools render_ui loop breaker', () => {
  it('returns failsafe spec on the first invalid render_ui attempt', async () => {
    const tools = createMiraStreamTools(dummyCtx);
    const renderUiTool = tools.render_ui as unknown as {
      execute?: (
        args: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    if (typeof renderUiTool.execute !== 'function') {
      throw new Error('render_ui tool execute is not available');
    }

    const first = await renderUiTool.execute({
      root: 'main_stack',
      elements: {},
    });

    expect(first.autoRecoveredFromInvalidSpec).toBe(true);
    expect(first.recoveredFromInvalidSpec).toBeUndefined();

    const spec = first.spec as Record<string, unknown>;
    expect(spec.root).toBe('main_stack');

    const elements = spec.elements as Record<string, unknown>;
    expect(elements.main_stack).toBeTruthy();
    expect((elements.main_stack as { type?: string }).type).toBe('Callout');
  });

  it('marks repeated invalid render_ui attempts as forced loop recovery', async () => {
    const tools = createMiraStreamTools(dummyCtx);
    const renderUiTool = tools.render_ui as unknown as {
      execute?: (
        args: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    if (typeof renderUiTool.execute !== 'function') {
      throw new Error('render_ui tool execute is not available');
    }

    await renderUiTool.execute({
      root: 'main_stack',
      elements: {},
    });

    const second = await renderUiTool.execute({
      root: 'main_stack',
      elements: {},
    });

    expect(second.autoRecoveredFromInvalidSpec).toBe(true);
    expect(second.forcedFromRecoveryLoop).toBe(true);
  });
});
