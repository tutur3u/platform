import { cn } from '@tuturuuu/utils/format';

export type EmbedPreviewMode =
  | 'inline'
  | 'fullpage'
  | 'popup'
  | 'slider'
  | 'popover'
  | 'sidetab';

interface ModeSpec {
  /** Absolute placement of the embedded form inside the host frame. */
  frame: string;
  /** Dim the host page behind the form. */
  dims?: boolean;
  /** Host page copy is visible around the form. */
  showsHost: boolean;
  /** A launcher affordance sits on the host page. */
  launcher?: 'bubble' | 'tab';
}

/**
 * Placement per mode, kept as data so the shapes stay comparable when read side
 * by side and a new mode is a single entry rather than another branch.
 */
const MODE_SPECS: Record<EmbedPreviewMode, ModeSpec> = {
  inline: { frame: 'inset-x-6 top-[42%] bottom-4 rounded-md', showsHost: true },
  fullpage: {
    frame: 'inset-x-0 top-5 bottom-0 rounded-none',
    showsHost: false,
  },
  popup: {
    dims: true,
    frame: 'inset-x-[18%] top-[26%] bottom-[14%] rounded-md shadow-xl',
    showsHost: true,
  },
  slider: {
    dims: true,
    frame: 'top-5 right-0 bottom-0 w-[46%] rounded-l-md shadow-xl',
    showsHost: true,
  },
  popover: {
    frame: 'right-3 bottom-8 h-[52%] w-[46%] rounded-md shadow-xl',
    launcher: 'bubble',
    showsHost: true,
  },
  sidetab: {
    frame: 'top-5 right-0 bottom-0 w-[40%] rounded-l-md shadow-xl',
    launcher: 'tab',
    showsHost: true,
  },
};

/** The skeleton of the embedded form: two label lines and a submit button. */
function FormSkeleton({ tint }: { tint: string }) {
  return (
    <div className="flex h-full flex-col gap-1.5 p-2.5">
      <span className={cn('block h-1.5 w-2/3 rounded-full', tint)} />
      <span className={cn('block h-1 w-1/2 rounded-full opacity-60', tint)} />
      <span className={cn('mt-auto block h-3 w-12 rounded-sm', tint)} />
    </div>
  );
}

/**
 * Miniature diagram of one embed mode.
 *
 * A drawn abstraction of the host page — chrome bar, body copy, form panel —
 * rather than a screenshot, so all six read at one scale, restyle with the
 * theme and cost nothing to load. The form panel is a tinted surface rather
 * than a solid fill: the point of the diagram is the *relationship* between
 * form and host page, which a solid block would cover up.
 */
export function EmbedPreview({
  mode,
  surfaceClassName,
  tintClassName,
  borderClassName,
  className,
}: {
  mode: EmbedPreviewMode;
  /** Tinted background for the form panel, e.g. `bg-dynamic-blue/15`. */
  surfaceClassName: string;
  /** Solid accent for the skeleton lines, e.g. `bg-dynamic-blue`. */
  tintClassName: string;
  /** Border for the form panel, e.g. `border-dynamic-blue/40`. */
  borderClassName: string;
  className?: string;
}) {
  const spec = MODE_SPECS[mode];

  return (
    <div
      aria-hidden
      className={cn(
        'relative aspect-[16/9] w-full overflow-hidden rounded-xl border border-foreground/10 bg-background',
        className
      )}
    >
      {/* Host page chrome */}
      <div className="absolute inset-x-0 top-0 flex h-5 items-center gap-1 border-foreground/[0.07] border-b bg-foreground/[0.03] px-2">
        <span className="h-1.5 w-1.5 rounded-full bg-foreground/15" />
        <span className="h-1.5 w-1.5 rounded-full bg-foreground/15" />
        <span className="h-1.5 w-1.5 rounded-full bg-foreground/15" />
      </div>

      {/* Host page body copy */}
      {spec.showsHost ? (
        <div className="absolute inset-x-6 top-8 space-y-1.5">
          <span className="block h-1.5 w-2/5 rounded-full bg-foreground/20" />
          <span className="block h-1 w-4/5 rounded-full bg-foreground/10" />
          <span className="block h-1 w-3/5 rounded-full bg-foreground/10" />
        </div>
      ) : null}

      {spec.dims ? (
        <div className="absolute inset-x-0 top-5 bottom-0 bg-background/70" />
      ) : null}

      {spec.launcher === 'bubble' ? (
        <span
          className={cn(
            'absolute right-3 bottom-2.5 h-4 w-4 rounded-full',
            tintClassName
          )}
        />
      ) : null}
      {/* The tab sits flush against the panel's leading edge so it reads as
          the handle that opened it, rather than a stray mark on the far side
          of the page. */}
      {spec.launcher === 'tab' ? (
        <span
          className={cn(
            'absolute top-1/2 right-[40%] h-10 w-1.5 -translate-y-1/2 rounded-l-sm',
            tintClassName
          )}
        />
      ) : null}

      {/* The embedded form */}
      <div
        className={cn(
          'absolute overflow-hidden border backdrop-blur-sm',
          surfaceClassName,
          borderClassName,
          spec.frame
        )}
      >
        <FormSkeleton tint={tintClassName} />
      </div>
    </div>
  );
}
