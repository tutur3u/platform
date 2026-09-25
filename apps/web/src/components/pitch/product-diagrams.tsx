import { DiagramMark } from '../capabilities/product-mark';
import { Connector, Label, Node, type VisualCopy } from './diagram-primitives';
import { colors } from './scene-primitives';

const products = [
  'Tasks',
  'Meet',
  'Calendar',
  'Mira',
  'Mail',
  'Drive',
  'Contacts',
  'Finance',
  'Forms',
  'Learn',
  'Teach',
  'Hive',
  'Nova',
  'Rewise',
  'Git',
];
const contextProducts = [
  'chat',
  'tasks',
  'drive',
  'contacts',
  'calendar',
  'finance',
];

export function ProductDiagram({
  id,
  copy: c,
}: {
  id: string;
  copy: VisualCopy;
}) {
  if (id === 'platform')
    return (
      <g>
        {products.map((product, i) => (
          <Node
            key={product}
            x={15 + (i % 5) * 116}
            y={25 + Math.floor(i / 5) * 112}
            w={106}
            h={96}
            label={product}
            product={product}
            tone={i}
          />
        ))}
      </g>
    );
  if (id === 'ownership')
    return (
      <g>
        <rect
          x={10}
          y={20}
          width={580}
          height={340}
          rx={24}
          fill="var(--background)"
          stroke={colors[1]}
          strokeWidth={2}
        />
        <Node
          x={30}
          y={147}
          w={160}
          h={96}
          label="Tuturuuu"
          product="platform"
          tone={1}
        />
        <path
          d="M190 195 H215 M215 83 V293"
          stroke={colors[1]}
          strokeWidth={1.5}
        />
        {[0, 1, 2].map((i) => (
          <path
            key={i}
            d={`M215 ${83 + i * 105} H235`}
            stroke={colors[1]}
            strokeWidth={1.5}
          />
        ))}
        {['Tasks', 'Meet', 'Mail', 'Chat', 'Drive', 'Finance'].map((p, i) => (
          <Node
            key={p}
            x={235 + (i % 2) * 172}
            y={44 + Math.floor(i / 2) * 105}
            w={152}
            label={p}
            product={p}
            tone={i}
          />
        ))}
      </g>
    );
  if (id === 'context')
    return (
      <g>
        <rect
          x={8}
          y={14}
          width={584}
          height={352}
          rx={24}
          fill={colors[1]}
          fillOpacity=".035"
          stroke={colors[1]}
          strokeDasharray="4 7"
        />
        <Label x={300} y={42} size={12} muted>
          {c.contextTitle}
        </Label>
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <Connector
              d={`M155 ${103 + i * 98} H${180 + i * 10} V${165 + i * 25} H222`}
              x={222}
              y={190}
              tone={i}
            />
            <Connector
              d={`M378 ${165 + i * 25} H${400 + i * 10} V${103 + i * 98} H445`}
              x={445}
              y={103 + i * 98}
              tone={i + 1}
            />
          </g>
        ))}
        {contextProducts.map((p, i) => (
          <Node
            key={p}
            x={i < 3 ? 25 : 445}
            y={68 + (i % 3) * 98}
            w={130}
            h={70}
            product={p}
            label={c.context[i]!}
            tone={i}
          />
        ))}
        <Node
          x={222}
          y={145}
          w={156}
          h={90}
          label="Mira"
          product="mira"
          tone={1}
        />
      </g>
    );
  if (id === 'ecosystem' || id === 'architecture')
    return (
      <g>
        {['tasks', 'meet', 'mail', 'mira'].map((p, i) => (
          <g key={p}>
            <Connector
              d={`M${87 + i * 142} 92 V130`}
              x={87 + i * 142}
              y={130}
              direction="down"
              tone={i}
            />
            <Node
              x={25 + i * 142}
              y={8}
              w={124}
              h={84}
              label={p === 'mira' ? 'Mira' : p[0]!.toUpperCase() + p.slice(1)}
              product={p}
              tone={i}
            />
          </g>
        ))}
        {c.layers.map((label, i) => (
          <g key={label}>
            {i < 2 && (
              <Connector
                d={`M300 ${180 + i * 82} V${212 + i * 82}`}
                x={300}
                y={212 + i * 82}
                direction="down"
                tone={i}
              />
            )}
            <rect
              x={25 - i * 5}
              y={130 + i * 82}
              width={550 + i * 10}
              height={50}
              rx={12}
              stroke={colors[i]}
              fill="var(--background)"
            />
            <rect
              x={25 - i * 5}
              y={130 + i * 82}
              width={550 + i * 10}
              height={50}
              rx={12}
              fill={colors[i]}
              fillOpacity=".08"
            />
            <Label x={300} y={160 + i * 82}>
              {label}
            </Label>
          </g>
        ))}
      </g>
    );
  if (id === 'mail')
    return (
      <g>
        <Connector d="M172 84 H215" x={215} y={84} />
        <Connector d="M385 84 H430" x={430} y={84} tone={1} />
        <Connector
          d="M505 122 V176 H100 V218"
          x={100}
          y={218}
          direction="down"
          tone={2}
        />
        <Connector
          d="M300 176 V218"
          x={300}
          y={218}
          direction="down"
          tone={2}
        />
        <Connector
          d="M505 176 V218"
          x={505}
          y={218}
          direction="down"
          tone={2}
        />
        <Node x={20} y={44} w={152} label={c.mail[0]!} product="mail" />
        <Node
          x={215}
          y={44}
          w={170}
          label={c.mail[1]!}
          product="mira"
          tone={1}
        />
        <Node
          x={430}
          y={44}
          w={150}
          label={c.mail[2]!}
          product="contacts"
          tone={2}
        />
        {['tasks', 'calendar', 'mail'].map((p, i) => (
          <Node
            key={p}
            x={25 + i * 200}
            y={218}
            w={150}
            product={p}
            label={c.mail[i + 3]!}
            tone={i}
          />
        ))}
        <Label x={300} y={344} size={11} muted>
          {c.boundary}
        </Label>
      </g>
    );
  if (id === 'ai')
    return (
      <g>
        <path
          d="M228 190 H300 M300 82 V302"
          stroke={colors[1]}
          strokeWidth={1.5}
          fill="none"
        />
        <Node
          x={35}
          y={135}
          w={193}
          h={110}
          product="mira"
          label="Mira"
          tone={1}
        />
        {[1, 2, 5].map((step, i) => (
          <g key={step}>
            <Connector
              d={`M300 ${82 + i * 110} H350`}
              x={350}
              y={82 + i * 110}
              tone={i}
            />
            <Node
              x={350}
              y={43 + i * 110}
              w={218}
              product={['drive', 'contacts', 'rewise'][i]}
              label={c.flow[step]!}
              tone={i}
            />
          </g>
        ))}
      </g>
    );
  if (id === 'workflow')
    return (
      <g>
        <Connector d="M180 92 H225" x={225} y={92} />
        <Connector d="M375 92 H420" x={420} y={92} tone={1} />
        <Connector
          d="M495 131 V238"
          x={495}
          y={238}
          direction="down"
          tone={2}
        />
        <Connector
          d="M420 277 H375"
          x={375}
          y={277}
          direction="left"
          tone={2}
        />
        <Connector
          d="M225 277 H180"
          x={180}
          y={277}
          direction="left"
          tone={3}
        />
        <Connector d="M30 277 H12 V92 H30" x={30} y={92} dashed />
        {['mail', 'mira', 'contacts', 'calendar', 'tasks', 'rewise'].map(
          (p, i) => {
            const col = i < 3 ? i : 5 - i;
            return (
              <Node
                key={p}
                x={30 + col * 195}
                y={i < 3 ? 53 : 238}
                label={c.flow[i]!}
                product={p}
                tone={i}
              />
            );
          }
        )}
        <Label x={300} y={193} size={11} muted>
          {c.boundary}
        </Label>
      </g>
    );
  if (id === 'chat')
    return (
      <g>
        <Connector d="M165 99 H235 V153" x={235} y={153} direction="down" />
        <Connector
          d="M435 99 H365 V153"
          x={365}
          y={153}
          direction="down"
          tone={1}
        />
        <Connector
          d="M300 231 V284"
          x={300}
          y={284}
          direction="down"
          tone={2}
        />
        <Node x={15} y={60} label={c.chat[0]!} product="contacts" />
        <Node x={435} y={60} label="Mira" product="mira" tone={1} />
        <Node
          x={190}
          y={153}
          w={220}
          label={c.chat[1]!}
          product="chat"
          tone={2}
        />
        <Node x={175} y={284} w={250} h={56} label={c.chat[3]!} tone={1} />
      </g>
    );
  if (id === 'collaboration')
    return (
      <g>
        <Connector d="M182 153 H222" x={222} y={153} tone={2} />
        <Connector d="M378 153 H418" x={418} y={153} tone={1} />
        {['mind', 'forms', 'drive'].map((p, i) => (
          <g key={p}>
            <Node
              x={22 + i * 198}
              y={92}
              w={160}
              h={120}
              label={['Mind', 'Docs', 'Drive'][i]!}
              product={p}
              tone={i}
            />
            <Label x={102 + i * 198} y={252} size={11}>
              {c.collaboration[i]}
            </Label>
          </g>
        ))}
        {[65, 265, 465].map((x, i) => (
          <g key={x}>
            <circle cx={x} cy={300} r={12} fill={colors[i]} fillOpacity=".2" />
            <circle
              cx={x + 23}
              cy={300}
              r={12}
              fill={colors[(i + 1) % 4]}
              fillOpacity=".2"
            />
            <circle
              cx={x + 46}
              cy={300}
              r={12}
              fill={colors[(i + 2) % 4]}
              fillOpacity=".2"
            />
          </g>
        ))}
      </g>
    );
  if (id === 'research')
    return (
      <g>
        <Connector d="M170 91 H220" x={220} y={91} />
        <Connector d="M380 91 H430" x={430} y={91} tone={1} />
        <Connector
          d="M510 130 V290 H395"
          x={395}
          y={290}
          direction="left"
          tone={2}
        />
        <Connector
          d="M205 290 H90 V130"
          x={90}
          y={130}
          direction="up"
          tone={3}
          dashed
        />
        <Node x={10} y={52} w={160} product="mind" label={c.research[0]!} />
        <Node
          x={220}
          y={52}
          w={160}
          product="hive"
          label={c.research[1]!}
          tone={1}
        />
        <Node
          x={430}
          y={52}
          w={160}
          product="git"
          label={c.research[2]!}
          tone={2}
        />
        <Node
          x={205}
          y={250}
          w={190}
          product="nova"
          label={c.research[3]!}
          tone={3}
        />
        {[250, 300, 350].map((x, i) => (
          <g key={x}>
            <circle
              cx={x}
              cy={191}
              r={17}
              fill={colors[i]}
              fillOpacity=".12"
              stroke={colors[i]}
            />
            <Label x={x} y={195} size={11}>
              {String.fromCharCode(65 + i)}
            </Label>
            <path d={`M${x} 130 V174`} stroke={colors[i]} />
          </g>
        ))}
      </g>
    );
  if (id === 'intelligence')
    return (
      <g>
        <path
          d="M300 123 V170 M67 170 H539"
          stroke="var(--muted-foreground)"
          strokeWidth={1.5}
        />
        {[0, 1, 2, 3, 4].map((i) => {
          const x = 67 + i * 118;
          return (
            <g key={i}>
              <Connector
                d={`M${x} 170 V222`}
                x={x}
                y={222}
                direction="down"
                tone={i}
              />
            </g>
          );
        })}
        <Node
          x={205}
          y={25}
          w={190}
          h={98}
          product="platform"
          label="Tuturuuu"
        />
        {['Mira', 'Aurora', 'Rewise', 'Nova', 'Crystal'].map((p, i) => (
          <g key={p}>
            <Node
              x={15 + i * 118}
              y={222}
              w={104}
              label={p}
              product={p}
              tone={i}
            />
            <Label x={67 + i * 118} y={326} size={10}>
              {c.intelligence[i]}
            </Label>
          </g>
        ))}
      </g>
    );
  if (id === 'business')
    return (
      <g>
        <Connector
          d="M390 95 C525 95 468 190 468 266"
          x={468}
          y={266}
          direction="down"
          tone={1}
        />
        <Connector
          d="M360 305 H240"
          x={240}
          y={305}
          direction="left"
          tone={2}
        />
        <Connector d="M25 305 C5 305 5 95 210 95" x={210} y={95} />
        <Node x={210} y={56} w={180} label={c.loop[0]!} product="tasks" />
        <Node
          x={360}
          y={266}
          w={215}
          label={c.loop[1]!}
          product="platform"
          tone={1}
        />
        <Node
          x={25}
          y={266}
          w={215}
          label={c.loop[2]!}
          product="finance"
          tone={2}
        />
        <DiagramMark x={270} y={171} size={60} product="tuturuuu" />
      </g>
    );
  return null;
}
