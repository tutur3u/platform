import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AI_STUDIO_BASE_URL,
  listModelsCurl,
  responsesTypeScript,
  toolLoopCurl,
} from './snippets';

function source(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

describe('AI Studio developer documentation', () => {
  it('documents production authentication without embedding a real secret', () => {
    expect(AI_STUDIO_BASE_URL).toBe('https://ai.tuturuuu.com/v1');
    expect(listModelsCurl).toContain('$TUTURUUU_AI_API_KEY');
    expect(responsesTypeScript).toContain('process.env.TUTURUUU_AI_API_KEY');
    expect(`${listModelsCurl}${responsesTypeScript}`).not.toMatch(
      /ttr_ai_[A-Za-z0-9_-]{24,}/u
    );
  });

  it('keeps the native tool-loop contract aligned with the public API', () => {
    expect(toolLoopCurl).toContain('"max_steps": 4');
    expect(toolLoopCurl).toContain('"current_time"');
    expect(toolLoopCurl).toContain('"calculator"');
  });

  it('registers the workspace-owned module in routing and navigation', () => {
    const page = source('../../app/[locale]/[wsId]/developer-docs/page.tsx');

    expect(page).toContain('<DeveloperDocsPanel');
    expect(page).toContain("t('developer-docs-description')");
    expect(source('../../app/[locale]/[wsId]/navigation.tsx')).toContain(
      "href('developer-docs')"
    );
  });
});
