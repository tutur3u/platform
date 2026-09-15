// @vitest-environment jsdom
import { renderAsync } from 'docx-preview';
import { expect, it } from 'vitest';
import { DOCX_FIXTURE } from './docx-preview-fixture';

it('renders a real Word paragraph and table with embedded HTML and font loading disabled', async () => {
  const content = document.createElement('div');
  const styles = document.createElement('div');
  await renderAsync(DOCX_FIXTURE, content, styles, {
    renderAltChunks: false,
    ignoreFonts: true,
    useBase64URL: true,
  });
  expect(content.textContent).toContain('Preview test document');
  expect(content.querySelector('table')?.textContent).toContain('Table cell');
  expect(content.querySelector('script,iframe,object,embed')).toBeNull();
});
