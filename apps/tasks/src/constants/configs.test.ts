import { describe, expect, it } from 'vitest';
import { siteConfig } from './configs';

describe('Tasks metadata config', () => {
  it('keeps social images, browser icons, and the manifest on the Tasks origin', () => {
    const tasksOrigin = new URL(siteConfig.url).origin;

    expect(new URL(siteConfig.ogImage).origin).toBe(tasksOrigin);
    expect(new URL(siteConfig.icons.icon).origin).toBe(tasksOrigin);
    expect(new URL(siteConfig.icons.shortcut).origin).toBe(tasksOrigin);
    expect(new URL(siteConfig.icons.apple).origin).toBe(tasksOrigin);
    expect(new URL(siteConfig.manifest).origin).toBe(tasksOrigin);
  });
});
