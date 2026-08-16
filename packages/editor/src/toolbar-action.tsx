import { type ComponentType, type Ref, type SVGProps, useRef } from 'react';

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
  const handledReset = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearPointerHandled = (target: HTMLButtonElement) => {
    if (handledReset.current !== null) clearTimeout(handledReset.current);
    handledReset.current = null;
    delete target.dataset.pointerActionHandled;
  };

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
          clearPointerHandled(event.currentTarget);
          if (!handled) run?.();
        }}
        onPointerCancel={(event) => {
          clearPointerHandled(event.currentTarget);
        }}
        onPointerDown={(event) => {
          if (event.button !== 0 || event.pointerType === 'touch') return;
          event.preventDefault();
          const target = event.currentTarget;
          clearPointerHandled(target);
          target.dataset.pointerActionHandled = 'true';
          // A press released outside the button has no click or pointercancel
          // here. Expire the marker after this activation turn so it cannot
          // swallow the user's next keyboard or touch activation.
          handledReset.current = setTimeout(
            () => clearPointerHandled(target),
            0
          );
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
