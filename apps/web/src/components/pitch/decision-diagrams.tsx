import { Connector, Label, Node, type VisualCopy } from './diagram-primitives';
import { colors } from './scene-primitives';

export function DecisionDiagram({
  id,
  copy: c,
}: {
  id: string;
  copy: VisualCopy;
}) {
  if (id === 'calendar')
    return (
      <g>
        <rect
          x={25}
          y={22}
          width={550}
          height={306}
          rx={16}
          fill="var(--background)"
          stroke="var(--border)"
        />
        {c.calendar.slice(0, 5).map((day, i) => (
          <g key={day}>
            <Label x={80 + i * 110} y={48}>
              {day}
            </Label>
            {i > 0 && (
              <path d={`M${25 + i * 110} 62 V328`} stroke="var(--border)" />
            )}
          </g>
        ))}
        {[80, 140, 200, 260].map((y) => (
          <path
            key={y}
            d={`M25 ${y} H575`}
            stroke="var(--border)"
            strokeDasharray="3 5"
          />
        ))}
        {[
          [0, 82, 90, 5],
          [1, 145, 110, 6],
          [2, 82, 65, 7],
          [3, 203, 96, 5],
          [4, 110, 145, 5],
          [2, 219, 70, 6],
        ].map(([col, y, h, label], i) => (
          <g key={i}>
            <rect
              x={33 + col! * 110}
              y={y}
              width={94}
              height={h}
              rx={8}
              fill={colors[i % 4]}
              fillOpacity=".12"
              stroke={colors[i % 4]}
            />
            <rect
              x={39 + col! * 110}
              y={y! + 9}
              width={3}
              height={h! - 18}
              rx={2}
              fill={colors[i % 4]}
            />
            <Label x={82 + col! * 110} y={y! + h! / 2 + 4} size={11}>
              {c.calendar[label!]}
            </Label>
          </g>
        ))}
        <Label x={300} y={359} size={12} muted>
          {c.calendar[8]}
        </Label>
      </g>
    );
  if (id === 'capacity')
    return (
      <g>
        <Label x={150} y={25} anchor="start" size={11} muted>
          {c.capacity[4]}
        </Label>
        {[0, 8, 16, 24, 32, 40].map((n, i) => (
          <g key={n}>
            <path d={`M${150 + i * 80} 55 V310`} stroke="var(--border)" />
            <Label x={150 + i * 80} y={333} size={11} muted>
              {n}
            </Label>
          </g>
        ))}
        {[28, 20, 36, 24].map((hours, i) => (
          <g key={i}>
            <Label x={130} y={91 + i * 66} anchor="end" size={12}>
              {c.capacity[i]}
            </Label>
            <rect
              x={150}
              y={70 + i * 66}
              width={hours * 10}
              height={32}
              rx={5}
              fill={colors[i]}
              fillOpacity=".55"
            />
            <Label
              x={160 + hours * 10}
              y={91 + i * 66}
              anchor="start"
              size={11}
            >
              {hours}
            </Label>
          </g>
        ))}
        <path
          d="M470 48 V310"
          stroke="var(--foreground)"
          strokeDasharray="4 5"
        />
        <Label x={470} y={40} size={11}>
          {c.capacity[5]}
        </Label>
        <Label x={300} y={368} size={10} muted>
          {c.capacity[6]}
        </Label>
      </g>
    );
  if (id === 'skills')
    return (
      <g>
        {c.skills.slice(0, 4).map((s, i) => (
          <Label key={s} x={197 + i * 107} y={42} size={11}>
            {s}
          </Label>
        ))}
        {[0, 1, 2, 3].map((row) => (
          <g key={row}>
            <Label x={118} y={93 + row * 59} anchor="end" size={12}>
              {String.fromCharCode(65 + row)}
            </Label>
            {[0, 1, 2, 3].map((col) => {
              const level = (row + col * 2) % 3;
              return (
                <g key={col}>
                  <rect
                    x={150 + col * 107}
                    y={66 + row * 59}
                    width={93}
                    height={44}
                    rx={8}
                    fill={colors[1]}
                    fillOpacity={[0.12, 0.35, 0.75][level]}
                  />
                  <Label x={197 + col * 107} y={93 + row * 59} size={12}>
                    {level + 1}
                  </Label>
                </g>
              );
            })}
          </g>
        ))}
        {c.skills.slice(4, 7).map((s, i) => (
          <g key={s}>
            <rect
              x={90 + i * 170}
              y={318}
              width={15}
              height={15}
              rx={3}
              fill={colors[1]}
              fillOpacity={[0.12, 0.35, 0.75][i]}
            />
            <Label x={113 + i * 170} y={330} anchor="start" size={11}>
              {i + 1} · {s}
            </Label>
          </g>
        ))}
        <Label x={300} y={367} size={10} muted>
          {c.skills[7]}
        </Label>
      </g>
    );
  if (id === 'evidence')
    return (
      <g>
        {c.evidence.slice(0, 3).map((label, i) => (
          <g key={label}>
            {i < 2 && (
              <Connector
                d={`M${346 + i * 106} 70 H${366 + i * 106}`}
                x={366 + i * 106}
                y={70}
                tone={i}
              />
            )}
            <Node
              x={260 + i * 106}
              y={42}
              w={86}
              h={56}
              label={label}
              tone={i}
            />
          </g>
        ))}
        {c.evidence.slice(3, 6).map((label, i) => (
          <g key={label}>
            <Label x={30} y={164 + i * 57} anchor="start" size={12}>
              {label}
            </Label>
            {[0, 1, 2].map((col) => (
              <g key={col}>
                <rect
                  x={260 + col * 106}
                  y={140 + i * 57}
                  width={86}
                  height={39}
                  rx={6}
                  fill={colors[col]}
                  fillOpacity=".08"
                  stroke="var(--border)"
                />
                <path
                  d={`M${294 + col * 106} ${160 + i * 57} h18`}
                  stroke={colors[col]}
                  strokeWidth={2}
                />
              </g>
            ))}
          </g>
        ))}
        <Label x={300} y={344} size={11} muted>
          {c.evidence[6]}
        </Label>
      </g>
    );
  if (id === 'pilot')
    return (
      <g>
        <Label x={300} y={29} size={12} muted>
          {c.pilot[3]}
        </Label>
        {Array.from({ length: 12 }, (_, i) => (
          <g key={i}>
            <Label x={weekX(i)} y={67} size={11}>
              {i + 1}
            </Label>
            <path
              d={`M${weekX(i)} 78 V323`}
              stroke="var(--border)"
              strokeDasharray="3 6"
            />
          </g>
        ))}
        {[
          [0, 3],
          [3, 5],
          [8, 4],
        ].map(([start, duration], i) => (
          <g key={i}>
            <rect
              x={20 + start! * 46}
              y={94 + i * 81}
              width={duration! * 46}
              height={47}
              rx={7}
              fill={colors[i]}
              fillOpacity=".14"
              stroke={colors[i]}
            />
            <Label
              x={20 + start! * 46 + duration! * 23}
              y={123 + i * 81}
              size={10}
            >
              {c.pilot[i]}
            </Label>
            <path
              d={`m${20 + (start! + duration!) * 46} ${149 + i * 81} 6 6-6 6-6-6Z`}
              fill={colors[i]}
            />
          </g>
        ))}
      </g>
    );
  if (id === 'roadmap')
    return (
      <g>
        <Connector d="M172 267 H198 V177 H224" x={224} y={177} />
        <Connector d="M376 177 H402 V87 H428" x={428} y={87} tone={1} dashed />
        {['tasks', 'mira', 'hive'].map((p, i) => (
          <g key={p}>
            <Node
              x={20 + i * 204}
              y={228 - i * 90}
              w={152}
              label={c.roadmap[i]!}
              product={p}
              tone={i}
            />
            <Label x={96 + i * 204} y={208 - i * 90} size={12} muted>
              0{i + 1}
            </Label>
          </g>
        ))}
      </g>
    );
  if (id === 'independence')
    return (
      <g>
        {c.independence.map((label, i) => (
          <g key={label}>
            <rect
              x={30 + i * 55}
              y={30 + i * 87}
              width={540 - i * 110}
              height={320 - i * 87}
              rx={18}
              fill="var(--background)"
              stroke={colors[i]}
              strokeWidth={1.5}
              strokeDasharray={i ? '5 6' : undefined}
            />
            <Label x={300} y={66 + i * 87} size={13}>
              {label}
            </Label>
          </g>
        ))}
        <Label x={300} y={315} size={11} muted>
          01 → 02 → 03
        </Label>
      </g>
    );
  if (id === 'readiness') {
    const labels = c[id];
    const marks = ['tasks', 'mira', 'hive'];
    return (
      <g>
        <Connector d="M185 160 H215" x={215} y={160} />
        <Connector d="M385 160 H415" x={415} y={160} tone={1} dashed />
        {labels.map((label, i) => (
          <g key={label}>
            <rect
              x={15 + i * 200}
              y={62}
              width={170}
              height={243}
              rx={18}
              fill="var(--background)"
              stroke={colors[i]}
              strokeDasharray={i === 2 ? '5 6' : undefined}
            />
            <Label x={100 + i * 200} y={94} size={11} muted>
              0{i + 1}
            </Label>
            <Node
              x={25 + i * 200}
              y={119}
              w={150}
              h={82}
              label={marks[i]!}
              product={marks[i]}
              tone={i}
            />
            <Label x={100 + i * 200} y={246} size={10}>
              {label}
            </Label>
            <circle
              cx={100 + i * 200}
              cy={277}
              r={5}
              fill={i === 0 ? colors[i] : 'var(--background)'}
              stroke={colors[i]}
            />
          </g>
        ))}
      </g>
    );
  }
  return null;
}
function weekX(i: number) {
  return 43 + i * 46;
}
