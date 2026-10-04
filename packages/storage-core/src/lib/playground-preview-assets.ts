const MAX_RESPONSE_BYTES = 600000;
function rebase(
  source: string,
  pattern: RegExp,
  replacement: (...parts: string[]) => string
) {
  let bytes = Buffer.byteLength(source);
  if (bytes > MAX_RESPONSE_BYTES) throw new Error('Preview exceeds limit');
  return source.replace(pattern, (match, ...parts) => {
    const value = replacement(...parts);
    bytes += Buffer.byteLength(value) - Buffer.byteLength(match);
    if (bytes > MAX_RESPONSE_BYTES)
      throw new Error('Rewritten preview exceeds limit');
    return value;
  });
}
export function rewritePreviewHtml(source: string, prefix: string) {
  const html = rebase(
    source,
    /(href|src|action)=(['"])\/(?!\/)/gi,
    (name, quote) => `${name}=${quote}${prefix}`
  );
  const result = `<base href="${prefix}">${html}`;
  if (Buffer.byteLength(result) > MAX_RESPONSE_BYTES)
    throw new Error('Rewritten preview exceeds limit');
  return result;
}
/** Rebase common root-relative module and stylesheet assets inside a private preview.
 * Runtime API calls, WebSockets and arbitrary navigation remain disabled by CSP. */
export function rewritePreviewAsset(
  source: string,
  contentType: string,
  prefix: string
) {
  if (/javascript|ecmascript/i.test(contentType)) {
    let result = rebase(
      source,
      /\b(from|import)(\s*)(['"])\/(?!\/)/g,
      (name, space, quote) => `${name}${space}${quote}${prefix}`
    );
    result = rebase(
      result,
      /\bimport(\s*\(\s*)(['"])\/(?!\/)/g,
      (space, quote) => `import${space}${quote}${prefix}`
    );
    return rebase(
      result,
      /\bnew URL(\s*\(\s*)(['"])\/(?!\/)/g,
      (space, quote) => `new URL${space}${quote}${prefix}`
    );
  }
  if (/text\/css/i.test(contentType)) {
    const result = rebase(
      source,
      /url\(\s*(['"]?)\/(?!\/)/gi,
      (quote) => `url(${quote}${prefix}`
    );
    return rebase(
      result,
      /@import(\s+)(['"])\/(?!\/)/gi,
      (space, quote) => `@import${space}${quote}${prefix}`
    );
  }
  return source;
}
