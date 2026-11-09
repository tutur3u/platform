import { cn } from '@tuturuuu/utils/format';
import { Line, PreviewFrame, PreviewHeader } from './frame';

/** Previews for the apps you work *in*: chat, documents, drive, workflows. */

/**
 * Chat: a channel thread — messages, an attachment, reactions, and someone
 * mid-reply. Deliberately shows conversation only; Chat does not lift messages
 * into tasks, and the visual should not imply that it does.
 */
export function ChatPreview() {
  return (
    <PreviewFrame>
      <div className="mb-2 flex items-center gap-1.5">
        <span className="font-mono-ui text-[0.6rem] text-dynamic-cyan/70">
          #
        </span>
        <Line className="bg-foreground/20" width={34} />
        <span className="ml-auto flex items-center">
          <span className="h-2 w-2 rounded-full border border-background bg-dynamic-cyan/50" />
          <span className="-ml-1 h-2 w-2 rounded-full border border-background bg-dynamic-purple/50" />
          <span className="-ml-1 h-2 w-2 rounded-full border border-background bg-dynamic-orange/40" />
        </span>
      </div>

      <div className="grid gap-1.5">
        <div className="flex justify-start">
          <div className="w-[74%] rounded-lg rounded-bl-sm bg-foreground/[0.07] p-1.5">
            <Line className="bg-foreground/20" width={100} />
            <Line className="mt-1 bg-foreground/12" width={62} />
          </div>
        </div>

        {/* An attached file, inline in the thread. */}
        <div className="flex justify-start">
          <div className="flex w-[58%] items-center gap-1.5 rounded-lg border border-foreground/10 bg-background/70 p-1.5">
            <span className="h-3 w-2.5 shrink-0 rounded-[2px] bg-dynamic-cyan/35" />
            <span className="flex-1">
              <Line className="bg-foreground/18" width={80} />
              <Line className="mt-1 bg-foreground/10" width={42} />
            </span>
          </div>
        </div>

        <div className="flex justify-end">
          <div className="w-[62%] rounded-lg rounded-br-sm bg-dynamic-cyan/20 p-1.5">
            <Line className="bg-dynamic-cyan/50" width={100} />
            <Line className="mt-1 bg-dynamic-cyan/30" width={54} />
          </div>
        </div>

        {/* Reaction chip + someone typing. */}
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1 rounded-full border border-foreground/10 bg-foreground/[0.04] px-1.5 py-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-dynamic-orange/60" />
            <span className="font-mono-ui text-[0.5rem] text-foreground/35 tabular-nums">
              3
            </span>
          </span>
          <span className="flex items-center gap-[3px] pr-1">
            <span className="h-1 w-1 rounded-full bg-foreground/30" />
            <span className="h-1 w-1 rounded-full bg-foreground/20" />
            <span className="h-1 w-1 rounded-full bg-foreground/12" />
          </span>
        </div>
      </div>
    </PreviewFrame>
  );
}

/**
 * Documents: a page being edited by more than one person — a live selection,
 * a margin comment, and a second cursor with its name flag.
 */
export function DocumentsPreview() {
  return (
    <PreviewFrame>
      <div className="relative rounded-md bg-background/60 p-2">
        {/* Heading */}
        <Line className="h-1.5 bg-foreground/30" width={52} />

        <div className="mt-2 grid gap-1">
          <Line width={100} />
          <Line width={88} />
        </div>

        {/* Selected range with a comment pin in the margin */}
        <div className="relative mt-2 rounded-[3px] bg-dynamic-orange/15 py-1 pr-6 pl-1 ring-1 ring-dynamic-orange/30">
          <Line className="bg-dynamic-orange/40" width={92} />
          <Line className="mt-1 bg-dynamic-orange/25" width={56} />
          <span className="absolute top-1 right-1 h-3 w-3 rounded-full border border-dynamic-orange/40 bg-dynamic-orange/20" />
        </div>

        <div className="mt-2 grid gap-1">
          <Line width={96} />
          <Line width={70} />
        </div>

        {/* A collaborator's cursor, with the name flag that follows it. */}
        <span className="absolute right-6 bottom-3 flex items-start">
          <span className="h-3 w-px bg-dynamic-purple" />
          <span className="h-2 w-6 rounded-[2px] rounded-tl-none bg-dynamic-purple/70" />
        </span>
      </div>
    </PreviewFrame>
  );
}

/**
 * Drive: shared storage — typed file tiles plus the capacity ring, drawn as a
 * conic gradient so it costs nothing to render.
 */
export function DrivePreview() {
  const files = [
    { tone: 'bg-dynamic-yellow/45', width: 70 },
    { tone: 'bg-dynamic-blue/40', width: 84 },
    { tone: 'bg-dynamic-green/40', width: 58 },
    { tone: 'bg-dynamic-purple/40', width: 76 },
  ];

  return (
    <PreviewFrame>
      <PreviewHeader
        label="Drive"
        value="62%"
        valueClassName="text-dynamic-yellow/80"
      />

      <div className="flex items-center gap-2.5">
        <div className="grid flex-1 grid-cols-2 gap-1.5">
          {files.map((file, index) => (
            <div
              className="rounded-md border border-foreground/10 bg-background/70 p-1.5"
              key={`file-${index}`}
            >
              <span
                className={cn('block h-2.5 w-2 rounded-[2px]', file.tone)}
              />
              <Line className="mt-1.5" width={file.width} />
            </div>
          ))}
        </div>

        {/* Capacity ring */}
        <div className="relative h-11 w-11 shrink-0">
          <span
            className="absolute inset-0 rounded-full"
            style={{
              background:
                'conic-gradient(color-mix(in oklab, var(--yellow) 70%, transparent) 0turn 0.62turn, color-mix(in oklab, var(--foreground) 8%, transparent) 0.62turn 1turn)',
            }}
          />
          <span className="absolute inset-[3px] rounded-full bg-background" />
        </div>
      </div>
    </PreviewFrame>
  );
}

/**
 * Workflows: a trigger fanning into two branches and rejoining. The SVG carries
 * the connectors so the nodes can stay plain elements, and the live path is
 * drawn brighter than the idle one.
 */
export function WorkflowsPreview() {
  return (
    <PreviewFrame>
      <PreviewHeader
        label="Flow"
        value="Live"
        valueClassName="text-dynamic-cyan/80"
      />

      <div className="relative h-[4.5rem]">
        <svg
          className="absolute inset-0 h-full w-full"
          fill="none"
          preserveAspectRatio="none"
          viewBox="0 0 100 60"
        >
          <title>Workflow branches</title>
          {/* trigger -> branch a -> merge (the live path) */}
          <path
            d="M18 30 C 30 30, 30 12, 44 12 L 56 12 C 70 12, 70 30, 82 30"
            stroke="color-mix(in oklab, var(--cyan) 55%, transparent)"
            strokeWidth="1.2"
          />
          {/* trigger -> branch b -> merge (idle) */}
          <path
            d="M18 30 C 30 30, 30 48, 44 48 L 56 48 C 70 48, 70 30, 82 30"
            stroke="color-mix(in oklab, var(--foreground) 14%, transparent)"
            strokeDasharray="2 2"
            strokeWidth="1.2"
          />
        </svg>

        {/* Trigger */}
        <span className="absolute top-1/2 left-0 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-lg border border-dynamic-cyan/40 bg-dynamic-cyan/15">
          <span className="h-1.5 w-1.5 rounded-full bg-dynamic-cyan" />
        </span>

        {/* Branch A — the one that ran */}
        <span className="absolute top-[8%] left-[42%] flex h-5 w-[18%] min-w-11 items-center justify-center gap-1 rounded-md border border-dynamic-cyan/35 bg-dynamic-cyan/10">
          <span className="h-1 w-1 rounded-full bg-dynamic-cyan/80" />
          <Line className="bg-dynamic-cyan/40" width={40} />
        </span>

        {/* Branch B — skipped this run */}
        <span className="absolute bottom-[8%] left-[42%] flex h-5 w-[18%] min-w-11 items-center justify-center gap-1 rounded-md border border-foreground/12 bg-foreground/[0.03]">
          <span className="h-1 w-1 rounded-full bg-foreground/25" />
          <Line className="bg-foreground/15" width={40} />
        </span>

        {/* Merge */}
        <span className="absolute top-1/2 right-0 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-lg border border-dynamic-green/40 bg-dynamic-green/15">
          <span className="h-1.5 w-1.5 rounded-full bg-dynamic-green" />
        </span>
      </div>
    </PreviewFrame>
  );
}
