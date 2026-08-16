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
          const handled =
            event.currentTarget.dataset.pointerActionHandled === 'true';
          delete event.currentTarget.dataset.pointerActionHandled;
          if (!handled) run?.();
        }}
        onPointerCancel={(event) => {
          delete event.currentTarget.dataset.pointerActionHandled;
        }}
        onPointerDown={(event) => {
          if (event.button !== 0 || event.pointerType === 'touch') return;
          event.preventDefault();
          event.currentTarget.dataset.pointerActionHandled = 'true';
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
