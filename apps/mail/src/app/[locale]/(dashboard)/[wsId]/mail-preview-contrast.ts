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

export function mailDarkSurface(sampled: RGB): RGB {
  return luminance(sampled) < 0.05 ? sampled : darkBackground;
}

export function neutralMailSurface(color: RGB) {
  return Math.max(...color) - Math.min(...color) < 24;
}

export function mailBorderColor(color: RGB, background: RGB): RGB {
  // Keep useful dividers, but prevent white/currentColor borders from glowing.
  if (
    !neutralMailSurface(color) ||
    luminance(background) >= 0.1 ||
    contrastRatio(color, background) < 3
  )
    return color;
  return composite(lightText, background, 0.2);
}

function css(color: RGB) {
  return `rgb(${color.join(',')})`;
}

/** Runs in the trusted parent, never by enabling scripts inside the email. */
export function applyMailPreviewContrast(
  document: Document,
  surface?: HTMLElement | null
) {
  const view = document.defaultView;
  if (!view) return;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const context = canvas.getContext('2d');
  const readColor = (value: string) => {
    const parsed = parseColor(value);
    if (parsed) return parsed;
    if (!context || !view.CSS.supports('color', value)) return null;
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b, alpha] = context.getImageData(0, 0, 1, 1).data;
    return { rgb: [r!, g!, b!] as RGB, alpha: alpha! / 255 };
  };
  let surfaceBackground = darkBackground;
  if (surface) {
    const color =
      surface.ownerDocument.defaultView?.getComputedStyle(
        surface
      ).backgroundColor;
    const sampled = color ? readColor(color) : null;
    if (sampled && sampled.alpha > 0)
      surfaceBackground = mailDarkSurface(sampled.rgb);
  }

  document.documentElement.style.setProperty(
    'background-color',
    css(surfaceBackground),
    'important'
  );
  document.body.style.setProperty(
    'background-color',
    css(surfaceBackground),
    'important'
  );
  const backgrounds = new WeakMap<Element, RGB>();
  for (const element of [
    document.body,
    ...document.body.querySelectorAll<HTMLElement>('*'),
  ]) {
    const style = view.getComputedStyle(element);
    const parentBackground =
      backgrounds.get(element.parentElement!) ?? surfaceBackground;
    const original = readColor(style.backgroundColor);
    let background = parentBackground;
    if (original && original.alpha > 0) {
      background = composite(original.rgb, parentBackground, original.alpha);
      // Normalize neutral paper, black and gray panels to the host surface.
      if (neutralMailSurface(background) && element.tagName !== 'IMG') {
        background = surfaceBackground;
        element.style.setProperty(
          'background-color',
          css(background),
          'important'
        );
      }
    }
    // Sender gradients can paint opaque black/white over background-color.
    // Only remove entirely neutral gradients; keep brand gradients and images.
    const gradientColors = style.backgroundImage.match(
      /(?:rgba?|color|oklch|oklab|lab|lch)\([^)]*\)/g
    );
    if (
      element.tagName !== 'IMG' &&
      !style.backgroundImage.includes('url(') &&
      gradientColors?.length &&
      gradientColors.every((value) => {
        const color = readColor(value);
        return color && neutralMailSurface(color.rgb);
      })
    ) {
      element.style.setProperty('background-image', 'none', 'important');
    }
    backgrounds.set(element, background);
    for (const side of ['top', 'right', 'bottom', 'left']) {
      const property = `border-${side}-color`;
      const color = readColor(style.getPropertyValue(property));
      if (!color || color.alpha === 0) continue;
      const visible = composite(color.rgb, background, color.alpha);
      const softened = mailBorderColor(visible, background);
      if (softened !== visible)
        element.style.setProperty(property, css(softened), 'important');
    }
    if (['IMG', 'STYLE', 'BR', 'HR'].includes(element.tagName)) continue;
    const foreground = readColor(style.color);
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
