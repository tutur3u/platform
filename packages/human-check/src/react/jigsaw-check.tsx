'use client';

import { type KeyboardEvent, type PointerEvent, useRef, useState } from 'react';
import type { JigsawChallenge } from '../challenge';
import type { InputMode, TrajectoryPoint } from '../motion';

export type JigsawCheckLabels = {
  start: string;
  title: string;
  instructions: string;
  slider: string;
  position: (percent: number) => string;
  loading: string;
  verifying: string;
  passed: string;
  tryAgain: string;
  newPuzzle: string;
  failed: string;
};

export type JigsawVerifyResult =
  | { ok: true; passToken: string }
  | { ok: false; retry: boolean };

type Phase =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'verifying'
  | 'passed'
  | 'retry'
  | 'failed';

/**
 * Drag the piece into its slot, or focus it and use the arrow keys (Shift
 * for larger steps) and Enter. The server owns the answer; this component
 * only reports the final position and the motion that produced it.
 */
export function JigsawCheck({
  load,
  verify,
  onPass,
  labels,
}: {
  load: () => Promise<JigsawChallenge>;
  verify: (input: {
    token: string;
    x: number;
    mode: InputMode;
    trajectory: TrajectoryPoint[];
  }) => Promise<JigsawVerifyResult>;
  onPass: (passToken: string) => void;
  labels: JigsawCheckLabels;
}) {
  const [challenge, setChallenge] = useState<JigsawChallenge | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [x, setX] = useState(0);
  const board = useRef<HTMLDivElement | null>(null);
  const trail = useRef<TrajectoryPoint[]>([]);
  const started = useRef(0);
  const drag = useRef<{ pointerX: number; x: number; scale: number } | null>(
    null
  );

  const max = challenge ? challenge.width - challenge.pieceSize : 0;
  const busy = phase === 'loading' || phase === 'verifying';
  const canMove = !!challenge && (phase === 'ready' || phase === 'retry');

  const start = async () => {
    setPhase('loading');
    try {
      const next = await load();
      setChallenge(next);
      setX(0);
      trail.current = [];
      setPhase('ready');
    } catch {
      setPhase('failed');
    }
  };

  const record = (nextX: number, y: number) => {
    const now = performance.now();
    if (!trail.current.length) started.current = now;
    trail.current.push({
      t: Math.round(now - started.current),
      x: Math.round(nextX * 10) / 10,
      y,
    });
    if (trail.current.length > 400) trail.current.splice(1, 1);
  };

  const submit = async (finalX: number, mode: InputMode) => {
    if (!challenge) return;
    setPhase('verifying');
    try {
      const result = await verify({
        token: challenge.token,
        x: finalX,
        mode,
        trajectory: trail.current,
      });
      if (result.ok) {
        setPhase('passed');
        onPass(result.passToken);
        return;
      }
      trail.current = [];
      setX(0);
      setPhase(result.retry ? 'retry' : 'failed');
    } catch {
      setPhase('failed');
    }
  };

  const clamp = (value: number) => Math.max(0, Math.min(max, value));

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!canMove || !board.current || !challenge) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const scale =
      board.current.getBoundingClientRect().width / challenge.width || 1;
    drag.current = { pointerX: event.clientX, x, scale };
    trail.current = [];
    record(x, event.clientY / scale);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const next = clamp(
      drag.current.x +
        (event.clientX - drag.current.pointerX) / drag.current.scale
    );
    setX(next);
    record(next, event.clientY / drag.current.scale);
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const { scale } = drag.current;
    const next = clamp(
      drag.current.x + (event.clientX - drag.current.pointerX) / scale
    );
    drag.current = null;
    record(next, event.clientY / scale);
    void submit(Math.round(next * 10) / 10, 'pointer');
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!canMove) return;
    const step = event.shiftKey ? 10 : 2;
    const moves: Record<string, number> = {
      ArrowRight: x + step,
      ArrowLeft: x - step,
      Home: 0,
    };
    if (event.key in moves) {
      event.preventDefault();
      if (!trail.current.length) record(x, 0);
      const next = clamp(moves[event.key]!);
      setX(next);
      record(next, 0);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      void submit(x, 'keyboard');
    }
  };

  const status = {
    idle: '',
    loading: labels.loading,
    ready: labels.instructions,
    verifying: labels.verifying,
    passed: labels.passed,
    retry: labels.tryAgain,
    failed: labels.failed,
  }[phase];

  if (!challenge || phase === 'idle' || (phase === 'loading' && !challenge))
    return (
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 font-medium text-sm hover:bg-muted disabled:opacity-50"
        onClick={() => void start()}
        disabled={busy}
      >
        {phase === 'loading' ? labels.loading : labels.start}
      </button>
    );

  const percent = (value: number, total: number) => `${(value / total) * 100}%`;
  return (
    <div className="space-y-2" data-testid="jigsaw-check">
      <p className="font-medium text-sm">{labels.title}</p>
      <div
        ref={board}
        className="relative w-full max-w-[320px] touch-none select-none overflow-hidden rounded-md border"
        style={{ aspectRatio: `${challenge.width} / ${challenge.height}` }}
      >
        <img
          src={challenge.background}
          alt=""
          draggable={false}
          className="absolute inset-0 h-full w-full"
        />
        <div
          role="slider"
          tabIndex={0}
          aria-label={labels.slider}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={Math.round(x)}
          aria-valuetext={labels.position(
            Math.round((x / Math.max(1, max)) * 100)
          )}
          aria-disabled={!canMove}
          className="absolute cursor-grab rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
          style={{
            left: percent(x, challenge.width),
            top: percent(challenge.pieceY, challenge.height),
            width: percent(challenge.pieceSize, challenge.width),
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onKeyDown={onKeyDown}
        >
          <img
            src={challenge.piece}
            alt=""
            draggable={false}
            className="pointer-events-none block w-full drop-shadow"
          />
        </div>
      </div>
      <p
        aria-live="polite"
        className={
          phase === 'failed'
            ? 'text-destructive text-sm'
            : 'text-muted-foreground text-sm'
        }
      >
        {status}
      </p>
      {phase === 'failed' ? (
        <button
          type="button"
          className="rounded-md border px-3 py-1.5 font-medium text-sm hover:bg-muted"
          onClick={() => void start()}
        >
          {labels.newPuzzle}
        </button>
      ) : null}
    </div>
  );
}
