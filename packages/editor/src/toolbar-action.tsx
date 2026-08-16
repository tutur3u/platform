import type { ComponentType, Ref, SVGProps } from 'react';

export type ToolbarIcon = ComponentType<SVGProps<SVGSVGElement>>;

export function ToolbarAction({
  active,
  buttonRef,
  controls,
  expanded,
  icon: Icon,
  label,
  run,
  type = 'button',
}: {
  active?: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
  controls?: string;
  expanded?: boolean;
  icon: ToolbarIcon;
  label: string;
  run?: () => void;
  type?: 'button' | 'submit';
}) {
  return (
    <span className="tuturuuu-editor-tool">
      <button
        aria-label={label}
        aria-pressed={active}
        aria-controls={controls}
        aria-expanded={expanded}
        onClick={(event) => {
          if (event.detail === 0) run?.();
        }}
        onPointerDown={(event) => {
          event.preventDefault();
          run?.();
        }}
        ref={buttonRef}
        type={type}
      >
        <Icon aria-hidden="true" />
      </button>
      <span aria-hidden="true" className="tuturuuu-editor-tooltip">
        {label}
      </span>
    </span>
  );
}
