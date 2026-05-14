const terrainTiles = [
  'bg-dynamic-green',
  'bg-dynamic-yellow/70',
  'bg-dynamic-lime',
  'bg-dynamic-sky',
  'bg-dynamic-yellow/70',
  'bg-dynamic-green',
  'bg-dynamic-lime',
  'bg-dynamic-green/80',
  'bg-dynamic-green',
  'bg-dynamic-yellow/70',
  'bg-dynamic-orange/80',
  'bg-dynamic-lime',
  'bg-dynamic-sky',
  'bg-dynamic-yellow/70',
  'bg-dynamic-green',
  'bg-dynamic-lime',
];

function VoxelTile({
  colorClass,
  index,
}: {
  colorClass: string;
  index: number;
}) {
  return (
    <div
      className={`relative h-16 w-16 rounded-lg border border-background/40 shadow-foreground/10 shadow-lg md:h-20 md:w-20 ${colorClass}`}
      style={{
        transform: `translateY(${(index % 4) * 4}px)`,
      }}
    >
      <div className="absolute inset-x-1 bottom-[-14px] h-4 rounded-b-lg bg-dynamic-orange/70" />
    </div>
  );
}

function House({ className = '' }: { className?: string }) {
  return (
    <div className={`absolute h-28 w-32 ${className}`}>
      <div className="absolute right-2 bottom-0 left-2 h-16 rounded-md border border-background/40 bg-dynamic-orange/50 shadow-foreground/20 shadow-xl" />
      <div className="absolute top-5 left-0 h-12 w-32 rounded-md bg-dynamic-blue shadow-foreground/15 shadow-lg" />
      <div className="absolute bottom-2 left-11 h-10 w-6 rounded-t-md bg-dynamic-orange" />
      <div className="absolute right-6 bottom-9 h-4 w-4 rounded-sm bg-dynamic-sky/70" />
    </div>
  );
}

function Tree({ className = '' }: { className?: string }) {
  return (
    <div className={`absolute h-28 w-20 ${className}`}>
      <div className="absolute bottom-0 left-8 h-12 w-5 rounded-sm bg-dynamic-orange" />
      <div className="absolute top-8 left-2 h-12 w-16 rounded-lg bg-dynamic-green" />
      <div className="absolute top-0 left-5 h-10 w-10 rounded-lg bg-dynamic-lime" />
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
    <div className="relative min-h-[520px] overflow-hidden rounded-lg border border-border bg-background shadow-2xl shadow-foreground/10">
      <div className="absolute inset-0 bg-radial from-dynamic-green/15 via-background to-muted" />
      <div className="absolute top-5 right-5 left-5 z-10 flex flex-wrap justify-end gap-2 text-foreground text-sm">
        {toolbarLabels.map((label) => (
          <span
            className="rounded-lg border border-border bg-background/85 px-3 py-2 shadow-sm backdrop-blur"
            key={label}
          >
            {label}
          </span>
        ))}
      </div>
      <div className="absolute top-1/2 left-1/2 grid grid-cols-4 gap-1 opacity-35 blur-[1px] [transform:translate(-50%,-50%)_rotateX(58deg)_rotateZ(-38deg)_scale(1.45)]">
        {terrainTiles.map((colorClass, index) => (
          <VoxelTile
            colorClass={colorClass}
            index={index}
            key={`${colorClass}-${index}`}
          />
        ))}
      </div>
      <div className="absolute top-1/2 left-1/2 grid grid-cols-4 gap-1 [transform:translate(-50%,-46%)_rotateX(58deg)_rotateZ(-38deg)_scale(1.05)]">
        {terrainTiles.map((colorClass, index) => (
          <VoxelTile
            colorClass={colorClass}
            index={index}
            key={`${index}-${colorClass}`}
          />
        ))}
      </div>
      <House className="top-[34%] left-[43%] z-20" />
      <House className="top-[22%] right-[22%] z-10 scale-75 opacity-55 blur-[1px]" />
      <Tree className="top-[48%] left-[25%] z-20" />
      <Tree className="right-[18%] bottom-[25%] z-20 scale-90" />
      <div className="absolute right-5 bottom-5 left-5 z-20 rounded-lg border border-border bg-background/90 p-3 shadow-foreground/10 shadow-xl backdrop-blur">
        <div className="flex items-center justify-center gap-2 overflow-x-auto">
          {dockLabels.map((label, index) => (
            <span
              className="shrink-0 rounded-lg border border-border bg-muted px-3 py-2 text-muted-foreground text-xs"
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
