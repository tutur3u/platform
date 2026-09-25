import { Connector, Label, Node, type VisualCopy } from './diagram-primitives';
import { colors } from './scene-primitives';

export function JourneyDiagram({
  id,
  copy: c,
}: {
  id: string;
  copy: VisualCopy;
}) {
  if (id === 'onboarding')
    return (
      <g>
        {['drive', 'mira', 'rewise', 'learn'].map((p, i) => (
          <g key={p}>
            {i < 3 && (
              <Connector
                d={`M${141 + i * 150} 180 H${159 + i * 150}`}
                x={159 + i * 150}
                y={180}
                tone={i}
              />
            )}
            <Node
              x={9 + i * 150}
              y={136}
              w={132}
              h={88}
              product={p}
              label={c.onboarding[i]!}
              tone={i}
            />
            <Label x={75 + i * 150} y={107} size={13} muted>
              0{i + 1}
            </Label>
          </g>
        ))}
        <path d="M75 262 H525" stroke="var(--border)" />
        <Label x={300} y={299} size={12} muted>
          {c.contextTitle}
        </Label>
      </g>
    );
  if (id === 'workforce')
    return (
      <g>
        {['calendar', 'rewise', 'drive'].map((p, i) => (
          <g key={p}>
            <Node
              x={30 + i * 195}
              y={58}
              w={150}
              h={100}
              product={p}
              label={c.workforce[i]!}
              tone={i}
            />
            <Connector
              d={`M${105 + i * 195} 158 V246`}
              x={105 + i * 195}
              y={246}
              tone={i}
              direction="down"
            />
          </g>
        ))}
        <rect
          x={25}
          y={246}
          width={550}
          height={72}
          rx={14}
          fill="var(--background)"
          stroke={colors[1]}
        />
        <Label x={300} y={288}>
          {c.boundary}
        </Label>
      </g>
    );
  if (id === 'audience')
    return (
      <g>
        {['tasks', 'meet', 'finance', 'hive'].map((p, i) => (
          <g key={p}>
            <Connector
              d={`M${85 + i * 143} 122 V186`}
              x={85 + i * 143}
              y={186}
              direction="down"
              tone={i}
            />
            <Node
              x={20 + i * 143}
              y={42}
              w={130}
              h={80}
              label={c.audience[i]!}
              product={p}
              tone={i}
            />
          </g>
        ))}
        <rect
          x={20}
          y={186}
          width={560}
          height={47}
          rx={12}
          fill={colors[0]}
          fillOpacity=".08"
          stroke={colors[0]}
        />
        <Label x={300} y={215}>
          {c.layers[1]}
        </Label>
        <Connector
          d="M300 233 V271"
          x={300}
          y={271}
          direction="down"
          tone={1}
        />
        <Node
          x={205}
          y={271}
          w={190}
          product="platform"
          label="Tuturuuu"
          tone={1}
        />
      </g>
    );
  if (id === 'vision')
    return (
      <g>
        <Connector d="M172 160 H235" x={235} y={160} />
        <Connector d="M365 160 H428" x={428} y={160} tone={1} />
        <Node x={12} y={121} w={160} product="contacts" label={c.vision[0]!} />
        <Node
          x={235}
          y={110}
          w={130}
          h={100}
          product="mira"
          label="Mira"
          tone={1}
        />
        <Node
          x={428}
          y={121}
          w={160}
          product="tasks"
          label={c.vision[1]!}
          tone={2}
        />
        <Connector
          d="M508 199 V295 H92 V199"
          x={92}
          y={199}
          direction="up"
          tone={2}
          dashed
        />
        <Label x={300} y={325} muted>
          {c.vision[2]}
        </Label>
      </g>
    );
  return null;
}
