import DOMPurify from 'dompurify';
import { afterEach, describe, expect, it } from 'vitest';

// Sent email previews use DOMPurify's default string-fragment contract.
afterEach(() => {
  DOMPurify.removeAllHooks();
  document.body.replaceChildren();
});

describe('sent email preview DOMPurify compatibility', () => {
  it('preserves email formatting and safe links while removing executable HTML', () => {
    const clean = DOMPurify.sanitize(
      '<p>Hello <strong>reader</strong></p><a href="https://example.test">Open</a>' +
        '<script>alert(1)</script><img src="x" onerror="alert(1)">' +
        '<a href="javascript:alert(1)">Unsafe</a>'
    );
    const preview = document.createElement('div');
    preview.innerHTML = clean;
    expect(preview.querySelector('strong')?.textContent).toBe('reader');
    expect(preview.querySelector('a')?.getAttribute('href')).toBe(
      'https://example.test'
    );
    expect(preview.querySelector('script')).toBeNull();
    expect(preview.querySelector('[onerror]')).toBeNull();
    expect(preview.querySelectorAll('a')[1]?.getAttribute('href')).toBeNull();
    expect(DOMPurify.sanitize('')).toBe('');
  });

  it('fails closed when an in-place raw-text root would reopen executable markup', () => {
    const root = document.createElement('style');
    root.textContent = '</style><img src=x onerror=alert(1)>';
    root.setAttribute('onclick', 'alert(1)');
    document.body.appendChild(root);

    expect(() => DOMPurify.sanitize(root, { IN_PLACE: true })).toThrow(
      /refusing to sanitize in place/
    );
    expect(
      DOMPurify.removed.some(
        (entry) => 'element' in entry && entry.element === root
      )
    ).toBe(true);
  });

  it('removes a dangerous raw-text child without rejecting its safe parent', () => {
    const root = document.createElement('div');
    root.innerHTML = '<span>Safe</span>';
    const style = document.createElement('style');
    style.textContent = '</style><img src=x onerror=alert(1)>';
    root.appendChild(style);
    document.body.appendChild(root);

    expect(DOMPurify.sanitize(root, { IN_PLACE: true })).toBe(root);
    expect(root.querySelector('style')).toBeNull();
    expect(root.querySelector('span')?.textContent).toBe('Safe');
  });

  const detachSection = (node: Node) => {
    if (node.nodeName === 'SECTION') node.parentNode?.removeChild(node);
  };
  // Literal hook names preserve DOMPurify's distinct addHook overloads.
  for (const [hook, registerHook] of [
    [
      'beforeSanitizeElements',
      () => DOMPurify.addHook('beforeSanitizeElements', detachSection),
    ],
    [
      'uponSanitizeElement',
      () => DOMPurify.addHook('uponSanitizeElement', detachSection),
    ],
    [
      'afterSanitizeElements',
      () => DOMPurify.addHook('afterSanitizeElements', detachSection),
    ],
    [
      'beforeSanitizeAttributes',
      () => DOMPurify.addHook('beforeSanitizeAttributes', detachSection),
    ],
    [
      'afterSanitizeAttributes',
      () => DOMPurify.addHook('afterSanitizeAttributes', detachSection),
    ],
  ] as const) {
    it(`neutralizes queued handlers when ${hook} detaches an in-place subtree`, () => {
      const root = document.createElement('div');
      root.innerHTML =
        '<section><img id="queued" onerror="alert(1)"></section><p>Safe</p>';
      const queued = root.querySelector('#queued');
      registerHook();

      expect(DOMPurify.sanitize(root, { IN_PLACE: true })).toBe(root);
      expect(root.querySelector('section')).toBeNull();
      expect(queued?.getAttribute('onerror')).toBeNull();
      expect(root.querySelector('p')?.textContent).toBe('Safe');
    });
  }
});
