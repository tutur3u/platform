import { expect, it } from 'vitest';
import { DOCX_FIXTURE } from './docx-preview-fixture';
import { validateMailDocx } from './docx-preview-validation';

it('accepts a real compressed DOCX with paragraphs and a table', async () => {
  await expect(validateMailDocx(DOCX_FIXTURE)).resolves.toBeUndefined();
});
it.each([
  new ArrayBuffer(0),
  new TextEncoder().encode('<html>not a document</html>').buffer,
  new ArrayBuffer(10 * 1024 * 1024 + 1),
])('rejects invalid or oversized attachments', async (bytes) => {
  await expect(validateMailDocx(bytes)).rejects.toThrow();
});
it('rejects dishonest expanded sizes before the document renderer runs', async () => {
  const bytes = DOCX_FIXTURE.slice(0);
  const view = new DataView(bytes);
  for (let i = 0; i < bytes.byteLength - 46; i++) {
    if (view.getUint32(i, true) === 0x02014b50) {
      view.setUint32(i + 24, 1, true);
      break;
    }
  }
  await expect(validateMailDocx(bytes)).rejects.toThrow();
});
it('stops validation when preview closes', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    validateMailDocx(DOCX_FIXTURE, controller.signal)
  ).rejects.toThrow();
});
