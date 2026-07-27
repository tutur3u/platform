import type { ComponentType, Ref, SVGProps } from 'react';

export type ToolbarIcon = ComponentType<SVGProps<SVGSVGElement>>;

export function ToolbarAction({
  active,
  buttonRef,
  icon: Icon,
  label,
  run,
  type = 'button',
}: {
  active?: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
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
        onClick={run}
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
