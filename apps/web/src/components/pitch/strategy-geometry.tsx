import { colors, Dot, Wire } from './scene-primitives';
export function StrategyGeometry({ id }: { id: string }) {
  switch (id) {
    case 'trust':
      return (
        <g>
          <path
            d="M300 30l150 55v110c0 85-75 130-150 165-75-35-150-80-150-165V85z"
            fill={colors[1]}
            fillOpacity=".06"
            stroke={colors[1]}
            strokeWidth="2"
          />
          <circle
            cx="300"
            cy="175"
            r="55"
            fill="none"
            stroke={colors[0]}
            strokeWidth="2"
          />
          <path
            d="M275 175l18 18 35-40"
            fill="none"
            stroke={colors[1]}
            strokeWidth="6"
          />
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <Dot x={225 + i * 75} y={275} r={9} tone={i} />
              <path d={`M${225 + i * 75} 260v-25`} stroke={colors[i]} />
            </g>
          ))}
        </g>
      );
    case 'architecture':
      return (
        <g>
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <path
                d={`M90 ${80 + i * 90}l210-50 210 50-210 50z`}
                fill={colors[i]}
                fillOpacity=".15"
                stroke={colors[i]}
              />
              <path
                d={`M90 ${80 + i * 90}v25l210 50 210-50v-25`}
                stroke={colors[i]}
                fill="none"
                opacity=".6"
              />
            </g>
          ))}
          <Wire d="M300 30V355" tone={3} dashed />
        </g>
      );
    case 'readiness':
      return (
        <g>
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <rect
                x={70 + i * 175}
                y={250 - i * 75}
                width="115"
                height={80 + i * 75}
                rx="8"
                fill={colors[i]}
                fillOpacity={0.65 - i * 0.2}
                stroke={colors[i]}
                strokeDasharray={i === 2 ? '6 6' : undefined}
              />
              <Dot x={127 + i * 175} y={220 - i * 75} r={8} tone={i} />
            </g>
          ))}
          <path d="M50 340H550" stroke="currentColor" opacity=".3" />
        </g>
      );
    case 'pilot':
      return (
        <g>
          {Array.from({ length: 12 }, (_, i) => (
            <g key={i}>
              <text
                x={57 + i * 45}
                y="45"
                textAnchor="middle"
                fill="currentColor"
                opacity=".5"
                fontSize="10"
              >
                {String(i + 1).padStart(2, '0')}
              </text>
              <path
                d={`M${57 + i * 45} 60V325`}
                stroke="currentColor"
                opacity=".08"
              />
            </g>
          ))}
          {[
            [35, 90, 135],
            [170, 170, 225],
            [395, 250, 135],
          ].map(([x, y, w], i) => (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={w}
                height="45"
                rx="7"
                fill={colors[i]}
                opacity=".7"
              />
              <circle
                cx={x! + w!}
                cy={y! + 22}
                r="8"
                fill="var(--background)"
                stroke={colors[i]}
                strokeWidth="3"
              />
            </g>
          ))}
        </g>
      );
    case 'team':
      return (
        <g>
          {[
            [225, 160],
            [375, 160],
            [300, 270],
          ].map(([x, y], i) => (
            <circle
              key={i}
              cx={x}
              cy={y}
              r="100"
              fill={colors[i]}
              fillOpacity=".13"
              stroke={colors[i]}
              strokeWidth="2"
            />
          ))}
          <Dot x={300} y={200} r={13} tone={3} />
        </g>
      );
    case 'engagement':
      return (
        <g>
          <path
            d="M110 65H440l55 55v205H110z"
            fill="var(--card)"
            stroke="currentColor"
            strokeOpacity=".2"
          />
          <path
            d="M440 65v55h55"
            fill="none"
            stroke="currentColor"
            opacity=".2"
          />
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <rect
                x="145"
                y={120 + i * 65}
                width="25"
                height="25"
                rx="4"
                fill={colors[i]}
                opacity=".3"
              />
              <path
                d={`M190 ${130 + i * 65}h220m-220 15h150`}
                stroke="currentColor"
                opacity=".2"
                strokeWidth="5"
              />
            </g>
          ))}
          <circle cx="470" cy="290" r="45" fill={colors[1]} />
          <path
            d="M452 290l12 12 24-29"
            fill="none"
            stroke="var(--background)"
            strokeWidth="4"
          />
        </g>
      );
    case 'business':
      return (
        <g>
          {[0, 1, 2].map((i) => (
            <g key={i} transform={`rotate(${i * 120} 300 190)`}>
              <path
                d="M300 60a130 130 0 0 1 113 195"
                fill="none"
                stroke={colors[i]}
                strokeWidth="30"
                opacity=".65"
              />
              <path
                d="M405 230l8 32 28-20"
                fill="none"
                stroke={colors[i]}
                strokeWidth="8"
              />
            </g>
          ))}
          <Dot x={300} y={190} r={27} tone={3} />
        </g>
      );
    case 'audience':
      return (
        <g>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <ellipse
              key={i}
              cx="300"
              cy="185"
              rx={40 + i * 35}
              ry="150"
              fill="none"
              stroke="currentColor"
              opacity=".09"
            />
          ))}
          {[90, 140, 190, 240, 290].map((y) => (
            <path
              key={y}
              d={`M90 ${y}Q300 ${y + 30}510 ${y}`}
              fill="none"
              stroke="currentColor"
              opacity=".09"
            />
          ))}
          <Wire
            d="M355 230Q220 40 110 110M355 230Q440 80 510 170M355 230Q390 300 465 315"
            tone={1}
          />
          <Dot x={355} y={230} r={14} tone={1} />
          {[
            [110, 110],
            [510, 170],
            [465, 315],
          ].map(([x, y], i) => (
            <Dot key={i} x={x!} y={y!} tone={i} />
          ))}
        </g>
      );
    case 'roadmap':
      return (
        <g>
          <path
            d="M30 335L195 230 350 245 555 55"
            fill="none"
            stroke={colors[0]}
            strokeWidth="3"
          />
          {[
            [195, 230],
            [350, 245],
            [555, 55],
          ].map(([x, y], i) => (
            <g key={i}>
              <path
                d={`M${x} ${y}V335`}
                stroke={colors[i]}
                strokeDasharray="4 6"
              />
              <circle
                cx={x}
                cy={y}
                r="22"
                fill="var(--background)"
                stroke={colors[i]}
                strokeWidth="3"
              />
              <Dot x={x!} y={y!} r={7} tone={i} />
            </g>
          ))}
          <path d="M30 335H575" stroke="currentColor" opacity=".2" />
        </g>
      );
    case 'intelligence':
      return (
        <g>
          {[0, 1, 2, 3, 4].map((i) => {
            const a = (i * Math.PI * 2) / 5 - Math.PI / 2,
              x = 300 + Math.cos(a) * 145,
              y = 190 + Math.sin(a) * 145;
            return (
              <g key={i}>
                <Wire d={`M300 190L${x} ${y}`} tone={i} />
                <circle
                  cx={x}
                  cy={y}
                  r="36"
                  fill={colors[i % 4]}
                  fillOpacity=".18"
                  stroke={colors[i % 4]}
                />
                <text
                  x={x}
                  y={y + 6}
                  textAnchor="middle"
                  fill="currentColor"
                  fontSize="16"
                >
                  {['M', 'A', 'R', 'N', 'C'][i]}
                </text>
              </g>
            );
          })}
          <circle
            cx="300"
            cy="190"
            r="42"
            fill="var(--background)"
            stroke="currentColor"
            strokeOpacity=".2"
          />
          <Dot x={300} y={190} r={12} tone={1} />
        </g>
      );
    case 'horizon':
      return (
        <g>
          <ellipse
            cx="300"
            cy="325"
            rx="255"
            ry="28"
            fill={colors[0]}
            opacity=".08"
          />
          {[0, 1, 2].map((i) => (
            <path
              key={i}
              d={`M${100 + i * 40} 320V${100 - i * 25}Q300 ${-20 + i * 10} ${500 - i * 40} ${100 - i * 25}V320`}
              fill="none"
              stroke={colors[i]}
              strokeWidth="2"
              opacity=".65"
            />
          ))}
          <circle cx="300" cy="225" r="24" fill={colors[1]} />
          <path
            d="M260 320v-35a40 40 0 0 1 80 0v35"
            fill={colors[1]}
            opacity=".6"
          />
        </g>
      );
    case 'closing':
      return (
        <g>
          {Array.from({ length: 24 }, (_, i) => {
            const a = (i * Math.PI) / 12;
            return (
              <path
                key={i}
                d={`M${300 + Math.cos(a) * 60} ${190 + Math.sin(a) * 60}L${300 + Math.cos(a) * 170} ${190 + Math.sin(a) * 170}`}
                stroke={colors[i % 4]}
                strokeWidth={i % 3 === 0 ? 8 : 2}
                opacity=".65"
              />
            );
          })}
          <circle cx="300" cy="190" r="35" fill={colors[1]} fillOpacity=".2" />
          <path d="M285 190h30m-15-15v30" stroke={colors[1]} strokeWidth="4" />
        </g>
      );
    default:
      return null;
  }
}
