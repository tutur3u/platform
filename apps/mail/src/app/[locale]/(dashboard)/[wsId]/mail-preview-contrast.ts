type RGB = [number, number, number];
const darkBackground: RGB = [18, 18, 18];
const lightText: RGB = [231, 231, 231];
const darkText: RGB = [23, 23, 23];

function luminance(color: RGB) {
  const linear = color.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
}

export function contrastRatio(first: RGB, second: RGB) {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function readableMailColor(foreground: RGB, background: RGB): RGB {
  if (contrastRatio(foreground, background) >= 4.5) return foreground;
  return contrastRatio(lightText, background) >
    contrastRatio(darkText, background)
    ? lightText
    : darkText;
}

function parseColor(value: string): { rgb: RGB; alpha: number } | null {
  const match = value.match(/^rgba?\(([^)]+)\)$/);
  if (!match) return null;
  const values = match[1]!.split(/[\s,/]+/).map(Number);
  if (values.length < 3 || values.some((part) => !Number.isFinite(part)))
    return null;
  return { rgb: values.slice(0, 3) as RGB, alpha: values[3] ?? 1 };
}

function composite(color: RGB, background: RGB, alpha: number): RGB {
  return color.map(
    (channel, index) => channel * alpha + background[index]! * (1 - alpha)
  ) as RGB;
}

function css(color: RGB) {
  return `rgb(${color.join(',')})`;
}

/** Runs in the trusted parent, never by enabling scripts inside the email. */
export function applyMailPreviewContrast(document: Document) {
  const view = document.defaultView;
  if (!view) return;
  const backgrounds = new WeakMap<Element, RGB>();
  for (const element of [
    document.body,
    ...document.body.querySelectorAll<HTMLElement>('*'),
  ]) {
    const style = view.getComputedStyle(element);
    const parentBackground =
      backgrounds.get(element.parentElement!) ?? darkBackground;
    const original = parseColor(style.backgroundColor);
    let background = parentBackground;
    if (original && original.alpha > 0) {
      background = composite(original.rgb, parentBackground, original.alpha);
      // Convert light neutral paper surfaces, preserving colored brand panels.
      if (
        Math.max(...background) - Math.min(...background) < 24 &&
        luminance(background) > 0.5 &&
        element.tagName !== 'IMG'
      ) {
        background = darkBackground;
        element.style.setProperty(
          'background-color',
          css(background),
          'important'
        );
      }
    }
    backgrounds.set(element, background);
    if (['IMG', 'STYLE', 'BR', 'HR'].includes(element.tagName)) continue;
    const foreground = parseColor(style.color);
    if (!foreground || foreground.alpha === 0) continue;
    const visibleColor = composite(
      foreground.rgb,
      background,
      foreground.alpha
    );
    const readable = readableMailColor(visibleColor, background);
    if (readable !== visibleColor) {
      element.style.setProperty('color', css(readable), 'important');
      element.style.setProperty(
        '-webkit-text-fill-color',
        css(readable),
        'important'
      );
    }
  }
}
