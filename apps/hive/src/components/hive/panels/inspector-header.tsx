import { PanelRightClose, SlidersHorizontal } from '@tuturuuu/icons';

export function InspectorHeader({ onToggle }: { onToggle: () => void }) {
  return (
    <div className="border-border/20 border-b p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-dynamic-green" />
          <p className="font-semibold text-base text-zinc-100">Inspector</p>
        </div>
        <button
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/25 bg-white/5 text-zinc-100 transition hover:bg-white/10"
          onClick={onToggle}
          title="Collapse inspector"
          type="button"
        >
          <PanelRightClose className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
