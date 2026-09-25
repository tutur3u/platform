import { colors, Dot, Tile, Wire } from './scene-primitives';

export function EcosystemGeometry({ id }: { id: string }) {
  switch (id) {
    case 'chat':
      return (
        <g>
          <Wire d="M110 88 V288 Q110 320 150 320 H480" dashed />
          {[0, 1, 2].map((i) => (
            <g
              key={i}
              transform={`translate(${i === 1 ? 150 : 55},${30 + i * 105})`}
            >
              <circle
                cx="20"
                cy="32"
                r="21"
                fill={colors[i]}
                fillOpacity=".2"
              />
              <Dot x={20} y={32} r={7} tone={i} />
              <rect
                x="58"
                width="330"
                height="76"
                rx="20"
                fill={colors[i]}
                fillOpacity=".1"
                stroke={colors[i]}
              />
              <path
                d="M80 27 H320 M80 45 H260"
                stroke={colors[i]}
                strokeWidth="5"
                strokeLinecap="round"
                opacity=".55"
              />
              {i === 1 && (
                <path
                  d="m352 20 4 9 9 4-9 4-4 9-4-9-9-4 9-4Z"
                  fill={colors[1]}
                />
              )}
            </g>
          ))}
        </g>
      );
    case 'mail':
      return (
        <g>
          {[0, 1, 2, 3].map((i) => (
            <g key={i} transform={`translate(${35 + i * 13},${65 + i * 55})`}>
              <rect
                width="170"
                height="84"
                rx="12"
                fill="var(--background)"
                stroke={colors[i]}
              />
              <path d="M10 10 85 51 160 10" fill="none" stroke={colors[i]} />
            </g>
          ))}
          <Wire d="M240 190 H305" tone={1} />
          <circle cx="337" cy="190" r="35" fill={colors[1]} fillOpacity=".18" />
          <path
            d="m337 166 7 17 17 7-17 7-7 17-7-17-17-7 17-7Z"
            fill={colors[1]}
          />
          <Wire
            d="M372 190 H405 V78 H440 M405 190 H440 M405 190 V302 H440"
            tone={1}
          />
          {[0, 1, 2].map((i) => (
            <g key={i} transform={`translate(440,${48 + i * 112})`}>
              <rect
                width="120"
                height="60"
                rx="12"
                fill={colors[i]}
                fillOpacity=".12"
                stroke={colors[i]}
              />
              <path
                d="m16 30 8 8 14-17 M52 25 H100 M52 38 H87"
                fill="none"
                stroke={colors[i]}
                strokeWidth="3"
              />
            </g>
          ))}
        </g>
      );
    case 'calendar':
      return (
        <g>
          <rect
            x="30"
            y="20"
            width="540"
            height="335"
            rx="20"
            fill="var(--background)"
            stroke="currentColor"
            strokeOpacity=".15"
          />
          {[0, 1, 2, 3, 4].map((i) => (
            <g key={i}>
              <Dot x={84 + i * 108} y={45} r={5} tone={i} />
              <path
                d={`M${30 + i * 108} 65 V355`}
                stroke="currentColor"
                opacity=".1"
              />
            </g>
          ))}
          {[100, 160, 220, 280].map((y) => (
            <path
              key={y}
              d={`M30 ${y} H570`}
              stroke="currentColor"
              opacity=".1"
            />
          ))}
          {[
            [40, 80, 100, 0],
            [148, 140, 145, 1],
            [256, 80, 75, 2],
            [364, 200, 120, 3],
            [472, 110, 130, 1],
            [256, 220, 105, 0],
          ].map(([x, y, h, tone], i) => (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width="88"
                height={h}
                rx="8"
                fill={colors[tone!]}
                fillOpacity=".22"
              />
              <path
                d={`M${x! + 12} ${y! + 19} h48 M${x! + 12} ${y! + 32} h30`}
                stroke={colors[tone!]}
                strokeWidth="3"
                strokeLinecap="round"
              />
            </g>
          ))}
          <Wire
            d="M80 335 C190 335 180 195 285 195 S400 100 510 85"
            tone={1}
            dashed
          />
        </g>
      );
    case 'collaboration':
      return (
        <g>
          <rect
            x="25"
            y="35"
            width="335"
            height="265"
            rx="15"
            fill={colors[2]}
            fillOpacity=".06"
            stroke={colors[2]}
          />
          <Tile x={58} y={72} w={88} h={62} tone={2} />
          <Tile x={215} y={162} w={85} h={80} tone={3} />
          <Wire d="M146 103 C210 100 160 200 215 200" tone={3} />
          <path
            d="M55 235 q45-80 105-40 t115-85"
            fill="none"
            stroke={colors[0]}
            strokeWidth="4"
            strokeLinecap="round"
          />
          <g transform="translate(322 95) rotate(5)">
            <rect
              width="220"
              height="260"
              rx="12"
              fill="var(--background)"
              stroke={colors[1]}
            />
            <rect
              x="25"
              y="35"
              width="135"
              height="12"
              rx="4"
              fill={colors[1]}
            />
            {[80, 105, 130, 185, 210].map((y, i) => (
              <path
                key={y}
                d={`M25 ${y} H${i % 2 ? 160 : 190}`}
                stroke="currentColor"
                strokeWidth="4"
                opacity=".18"
              />
            ))}
            <rect
              x="25"
              y="142"
              width="125"
              height="20"
              fill={colors[2]}
              fillOpacity=".25"
            />
            <path d="M150 139 V165" stroke={colors[2]} strokeWidth="2" />
          </g>
          <path d="m170 150 7 30 7-13 14-5Z" fill={colors[0]} />
          <path d="m470 215 7 30 7-13 14-5Z" fill={colors[3]} />
        </g>
      );
    case 'research':
      return (
        <g>
          <path
            d="M65 255 295 125 540 255 305 365Z"
            fill={colors[0]}
            fillOpacity=".08"
            stroke={colors[0]}
            strokeOpacity=".4"
          />
          {[0, 1, 2, 3].map((i) => (
            <g
              key={i}
              transform={`translate(${130 + i * 100},${i % 2 ? 170 : 230})`}
            >
              <path
                d="m-35 0 35-20 35 20-35 20Z m0 0 v40 l35 20 35-20 V0 M0 20 V60"
                fill={colors[i]}
                fillOpacity=".2"
                stroke={colors[i]}
              />
              <circle
                cy="-45"
                r="19"
                fill={colors[i]}
                fillOpacity=".15"
                stroke={colors[i]}
              />
              <Dot x={0} y={-45} r={5} tone={i} />
            </g>
          ))}
          <Wire
            d="M130 185 C150 75 400 70 430 125 M230 125 Q275 65 330 185"
            tone={1}
            dashed
          />
          <path
            d="M60 50 H175 M60 67 H140 M430 45 H540 M470 62 H540"
            stroke="currentColor"
            strokeWidth="3"
            opacity=".2"
          />
        </g>
      );
    case 'ownership':
      return (
        <g>
          <rect
            x="35"
            y="35"
            width="530"
            height="310"
            rx="35"
            fill="none"
            stroke={colors[1]}
            strokeDasharray="6 8"
          />
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const x = 120 + (i % 3) * 180;
            const y = i < 3 ? 100 : 280;
            return (
              <g key={i}>
                <Wire d={`M${x} ${y} L300 190`} tone={i} />
                <rect
                  x={x - 40}
                  y={y - 28}
                  width="80"
                  height="56"
                  rx="12"
                  fill="var(--background)"
                  stroke={colors[i % 4]}
                />
                <path
                  d={`M${x - 18} ${y - 6} h36 M${x - 18} ${y + 6} h24`}
                  stroke={colors[i % 4]}
                  strokeWidth="4"
                  strokeLinecap="round"
                />
              </g>
            );
          })}
          <circle
            cx="300"
            cy="190"
            r="42"
            fill="var(--background)"
            stroke={colors[1]}
            strokeWidth="3"
          />
          <path
            d="M280 173 h40 M300 173 v36 M283 182 v22 q17 20 34 0 v-22"
            fill="none"
            stroke={colors[1]}
            strokeWidth="5"
            strokeLinecap="round"
          />
        </g>
      );
    default:
      return null;
  }
}
