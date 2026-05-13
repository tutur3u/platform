'use client';

import { Plus, Sparkles } from '@tuturuuu/icons';

export function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="animate-pulse border-2 border-border bg-card shadow-[5px_5px_0_var(--border)]"
        >
          <div className="h-11 border-border border-b-2 bg-muted/40" />
          <div className="space-y-px p-0">
            {[1, 2].map((j) => (
              <div
                key={j}
                className="h-10 border-border border-t bg-muted/20"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="border-2 border-border border-dashed bg-muted/60 p-10 text-center shadow-[8px_8px_0_var(--border)]">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center border-2 border-border bg-background shadow-[4px_4px_0_var(--border)]">
        <Sparkles className="h-7 w-7" />
      </div>
      <p className="mx-auto max-w-sm text-muted-foreground leading-7">
        No sections yet. Add a section to start organizing your modules.
      </p>
      <button
        className="mt-5 inline-flex items-center gap-2 border-2 border-border bg-primary px-4 py-2 font-bold text-primary-foreground text-sm shadow-[3px_3px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--border)]"
        onClick={onAdd}
        type="button"
      >
        <Plus className="h-4 w-4" />
        Add first section
      </button>
    </div>
  );
}
