const terrainTiles = [
  '#a8c85a',
  '#d9c789',
  '#a8c85a',
  '#7eb6d9',
  '#d9c789',
  '#a8c85a',
  '#8fba51',
  '#a8c85a',
  '#a8c85a',
  '#d9c789',
  '#6f4f34',
  '#a8c85a',
  '#7eb6d9',
  '#d9c789',
  '#a8c85a',
  '#8fba51',
];

function VoxelTile({ color, index }: { color: string; index: number }) {
  return (
    <div
      className="relative h-20 w-20 rounded-lg border border-white/30 shadow-lg shadow-zinc-900/10"
      style={{
        background: color,
        transform: `translateY(${(index % 4) * 4}px)`,
      }}
    >
      <div className="absolute inset-x-1 bottom-[-14px] h-4 rounded-b-lg bg-[#7b673d] opacity-80" />
    </div>
  );
}

function House({ className = '' }: { className?: string }) {
  return (
    <div className={`absolute h-28 w-32 ${className}`}>
      <div className="absolute right-2 bottom-0 left-2 h-16 rounded-md border border-white/40 bg-[#d7a46b] shadow-xl shadow-zinc-900/20" />
      <div className="absolute top-5 left-0 h-12 w-32 rounded-md bg-[#6fa8dc] shadow-lg shadow-zinc-900/15" />
      <div className="absolute bottom-2 left-11 h-10 w-6 rounded-t-md bg-[#7c4f2d]" />
      <div className="absolute right-6 bottom-9 h-4 w-4 rounded-sm bg-[#8bc2e0]" />
    </div>
  );
}

function Tree({ className = '' }: { className?: string }) {
  return (
    <div className={`absolute h-28 w-20 ${className}`}>
      <div className="absolute bottom-0 left-8 h-12 w-5 rounded-sm bg-[#74512f]" />
      <div className="absolute top-8 left-2 h-12 w-16 rounded-lg bg-[#7fa94d]" />
      <div className="absolute top-0 left-5 h-10 w-10 rounded-lg bg-[#b3d36d]" />
    </div>
  );
}

export function HiveLandingWorld({
  dockLabels,
  toolbarLabels,
}: {
  dockLabels: string[];
  toolbarLabels: string[];
}) {
  return (
    <div className="relative min-h-[520px] overflow-hidden rounded-none bg-[#f4f0df]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_45%_35%,rgba(255,255,255,0.86),rgba(244,240,223,0.4)_42%,rgba(224,214,184,0.55))]" />
      <div className="absolute top-8 right-8 left-8 z-10 flex flex-wrap justify-end gap-3 text-sm text-zinc-700">
        {toolbarLabels.map((label) => (
          <span
            className="rounded-lg border border-zinc-200 bg-white/80 px-4 py-2 shadow-sm"
            key={label}
          >
            {label}
          </span>
        ))}
      </div>
      <div className="absolute top-1/2 left-1/2 grid grid-cols-4 gap-1 opacity-35 blur-[1px] [transform:translate(-50%,-50%)_rotateX(58deg)_rotateZ(-38deg)_scale(1.45)]">
        {terrainTiles.map((color, index) => (
          <VoxelTile color={color} index={index} key={`${color}-${index}`} />
        ))}
      </div>
      <div className="absolute top-1/2 left-1/2 grid grid-cols-4 gap-1 [transform:translate(-50%,-46%)_rotateX(58deg)_rotateZ(-38deg)_scale(1.05)]">
        {terrainTiles.map((color, index) => (
          <VoxelTile color={color} index={index} key={`${index}-${color}`} />
        ))}
      </div>
      <House className="top-[34%] left-[43%] z-20" />
      <House className="top-[22%] right-[22%] z-10 scale-75 opacity-55 blur-[1px]" />
      <Tree className="top-[48%] left-[25%] z-20" />
      <Tree className="right-[18%] bottom-[25%] z-20 scale-90" />
      <div className="absolute right-12 bottom-12 left-12 z-20 rounded-xl border border-zinc-200 bg-white/82 p-3 shadow-xl shadow-zinc-900/10">
        <div className="flex items-center justify-center gap-3">
          {dockLabels.map((label, index) => (
            <span
              className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600"
              key={label}
            >
              {label} {index + 1}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
