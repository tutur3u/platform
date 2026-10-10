/** Read only a bounded fixture error sample; never wait indefinitely on a body. */
export async function failureSummary(
  response,
  { maxBytes = 4096, timeoutMs = 1000 } = {}
) {
  if (!response.body) return '<empty body>';
  const reader = response.body.getReader();
  let timer;
  const chunks = [];
  let bytes = 0;
  try {
    await Promise.race([
      (async () => {
        while (bytes < maxBytes) {
          const { value, done } = await reader.read();
          if (done) return;
          const chunk = value.subarray(0, maxBytes - bytes);
          chunks.push(Buffer.from(chunk));
          bytes += chunk.byteLength;
        }
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Diagnostic body deadline')),
          timeoutMs
        );
      }),
    ]);
    return Buffer.concat(chunks).toString('utf8');
  } catch (error) {
    return `<diagnostic unavailable: ${error.message}>`;
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => {});
  }
}
