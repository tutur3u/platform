import { cn } from '@tuturuuu/utils/format';

/**
 * Mira's brand mark as inline SVG. It ships inside the JavaScript bundle, so
 * it never depends on a public asset path, an image optimizer or the theme
 * swapping between two bitmaps, and a failed request can never leave a
 * broken-image glyph in the UI. The tile follows the surface through the
 * `muted` token; the four strokes keep their brand colors.
 */
export function MiraMark({
  size = 28,
  className,
  ...props
}: {
  size?: number;
  className?: string;
  'data-testid'?: string;
}) {
  return (
    <svg
      {...props}
      width={size}
      height={size}
      viewBox="0 0 512 512"
      aria-hidden="true"
      focusable="false"
      className={cn('shrink-0', className)}
    >
      <rect width="512" height="512" rx="112" className="fill-muted" />
      <g transform="translate(118 80) scale(1.1)">
        <path
          fill="#E94646"
          d="M186.239 142.619 125.026 248.643 63.5285 142.127 55.4808 218.696l55.2732 95.736h28.544l54.988-95.244-8.047-76.569Z"
        />
        <path
          fill="#FB7B05"
          d="M186.619.492 125.406 106.516 63.9085 0 55.8608 76.5694l55.2732 95.7356h28.544l54.988-95.2433L186.619.492Z"
        />
        <path
          fill="#4ACA3F"
          fillRule="evenodd"
          d="M18.175 142.127 0 315.05l45.0064 4.731 18.6722-177.654H18.175Z"
          clipRule="evenodd"
        />
        <path
          fill="#4180E9"
          fillRule="evenodd"
          d="m185.967 142.127 18.695 177.873 45.006-4.73-18.198-173.143h-45.503Z"
          clipRule="evenodd"
        />
      </g>
    </svg>
  );
}
