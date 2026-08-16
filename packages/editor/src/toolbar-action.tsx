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
          target.setPointerCapture?.(event.pointerId);
          run?.();
        }}
        onPointerUp={(event) => {
          const target = event.currentTarget;
          target.releasePointerCapture?.(event.pointerId);
          // Pointer capture delivers an outside release here too. Keep the
          // marker through the matching click, then expire it if no click was
          // produced by an abandoned gesture.
          handledReset.current = setTimeout(
            () => clearPointerHandled(target),
            0
          );
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
