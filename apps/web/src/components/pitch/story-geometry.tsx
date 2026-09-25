import { colors, Dot, Rings, Tile, Wire } from './scene-primitives';
export function StoryGeometry({ id }: { id: string }) {
  switch (id) {
    case 'origin':
      return (
        <g>
          <circle
            cx="300"
            cy="190"
            r="130"
            fill="none"
            stroke="currentColor"
            opacity=".1"
          />
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i * Math.PI) / 6;
            return (
              <Wire
                key={i}
                d={`M${300 + Math.cos(a) * 112} ${190 + Math.sin(a) * 112} l${Math.cos(a) * 12} ${Math.sin(a) * 12}`}
                tone={i}
              />
            );
          })}
          <Wire d="M300 90 V190 L385 240" tone={1} />
          <Dot x={300} y={190} r={12} tone={1} />
          <path
            d="M185 95 Q70 210 185 310"
            fill="none"
            stroke={colors[0]}
            strokeWidth="30"
            opacity=".18"
          />
          <path
            d="M405 95 Q520 210 405 310"
            fill="none"
            stroke={colors[2]}
            strokeWidth="30"
            opacity=".18"
          />
        </g>
      );
    case 'problem':
      return (
        <g>
          {[
            [80, 50, -9],
            [310, 25, 8],
            [175, 170, -4],
            [420, 220, 12],
            [45, 285, -10],
          ].map(([x, y, r], i) => (
            <g key={i} transform={`rotate(${r} ${x} ${y})`}>
              <Tile x={x!} y={y!} w={150} h={90} tone={i} />
              <path
                d={`M${x! + 18} ${y! + 25}h80 m-80 20h110 m-110 20h60`}
                stroke="currentColor"
                opacity=".2"
                strokeWidth="5"
              />
            </g>
          ))}
          <Wire
            d="M230 95 C400 300 40 70 330 215 S300 400 460 255"
            tone={3}
            dashed
          />
        </g>
      );
    case 'shift':
      return (
        <g>
          {[0, 1, 2].map((i) => (
            <g key={i} transform={`translate(${i * 200} 0)`}>
              {i === 0 ? (
                <>
                  <Tile x={25} y={100} w={60} h={60} />
                  <Tile x={100} y={200} w={60} h={60} tone={2} />
                </>
              ) : i === 1 ? (
                <>
                  <Tile x={25} y={115} w={135} h={135} tone={1} />
                  {[0, 1, 2].map((j) => (
                    <rect
                      key={j}
                      x={40 + j * 38}
                      y={135}
                      width={27}
                      height={90}
                      rx={4}
                      fill={colors[j]}
                      opacity=".5"
                    />
                  ))}
                </>
              ) : (
                <>
                  <Rings x={95} y={185} />
                  <Dot x={145} y={130} tone={1} />
                  <Dot x={40} y={215} tone={2} />
                </>
              )}
            </g>
          ))}
        </g>
      );
    case 'vision':
      return (
        <g>
          <path
            d="M60 330 Q300 -170 540 330"
            fill="none"
            stroke={colors[0]}
            strokeWidth="2"
          />
          {[0, 1, 2, 3].map((i) => (
            <path
              key={i}
              d={`M${110 + i * 30} 330 Q300 ${-70 + i * 65} ${490 - i * 30} 330`}
              fill="none"
              stroke={colors[i]}
              strokeWidth={i === 3 ? 18 : 2}
              opacity=".5"
            />
          ))}
          <circle cx="300" cy="235" r="50" fill={colors[1]} opacity=".12" />
          <Dot x={300} y={235} r={16} tone={1} />
          <path d="M40 330H560" stroke="currentColor" opacity=".25" />
        </g>
      );
    case 'platform':
      return (
        <g>
          {Array.from({ length: 15 }, (_, i) => {
            const x = 45 + (i % 5) * 105,
              y = 40 + Math.floor(i / 5) * 105;
            return (
              <g key={i}>
                <Tile x={x} y={y} w={90} h={90} tone={i} />
                <path
                  d={`M${x + 25} ${y + 30}h40v30h-40z`}
                  stroke={colors[i % 4]}
                  fill="none"
                />
                <Dot x={x + 45} y={y + 45} r={6} tone={i} />
              </g>
            );
          })}
        </g>
      );
    case 'context':
      return (
        <g>
          {[
            [85, 70],
            [460, 65],
            [70, 290],
            [475, 285],
            [285, 30],
            [295, 335],
          ].map(([x, y], i) => (
            <g key={i}>
              <Wire d={`M${x} ${y} Q300 ${y} 300 185`} tone={i} />
              <Dot x={x!} y={y!} r={22} tone={i} />
            </g>
          ))}
          <circle
            cx="300"
            cy="185"
            r="66"
            fill="var(--background)"
            stroke={colors[1]}
            strokeWidth="2"
          />
          <path
            d="M270 185h60 M300 155v60"
            stroke={colors[1]}
            strokeWidth="4"
          />
        </g>
      );
    case 'ai':
      return (
        <g>
          <rect
            x="65"
            y="40"
            width="470"
            height="280"
            rx="32"
            fill={colors[0]}
            fillOpacity=".07"
            stroke={colors[0]}
            strokeOpacity=".3"
          />
          <path d="M110 320v35l45-35" fill={colors[0]} fillOpacity=".2" />
          {Array.from({ length: 31 }, (_, i) => (
            <rect
              key={i}
              x={115 + i * 12}
              y={180 - (12 + Math.sin(i * 0.7) ** 2 * 65)}
              width="5"
              height={24 + Math.sin(i * 0.7) ** 2 * 130}
              rx="3"
              fill={colors[Math.floor(i / 8) % 4]}
            />
          ))}
          <circle cx="475" cy="85" r="9" fill={colors[1]} />
        </g>
      );
    case 'workflow':
      return (
        <g>
          <Wire d="M60 75H210V180H390V290H540" tone={1} />
          {[
            [60, 75],
            [210, 180],
            [390, 290],
          ].map(([x, y], i) => (
            <g key={i}>
              <Tile x={x!} y={y! - 35} w={150} h={80} tone={i} />
              <circle cx={x! + 28} cy={y! + 5} r={12} fill={colors[i]} />
              <path
                d={`M${x! + 55} ${y!}h70m-70 16h45`}
                stroke="currentColor"
                opacity=".3"
              />
            </g>
          ))}
        </g>
      );
    case 'workforce':
      return (
        <g>
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <circle
                cx={125 + i * 175}
                cy={135}
                r="45"
                fill={colors[i]}
                opacity=".25"
              />
              <path
                d={`M${65 + i * 175} 280v-50a60 60 0 0 1 120 0v50`}
                fill={colors[i]}
                opacity=".6"
              />
              <circle cx={125 + i * 175} cy={135} r="21" fill={colors[i]} />
            </g>
          ))}
          <Wire d="M125 320H475" tone={1} />
          {[125, 300, 475].map((x, i) => (
            <Dot key={x} x={x} y={320} tone={i} />
          ))}
        </g>
      );
    case 'capacity':
      return (
        <g>
          {[0, 1, 2, 3].map((i) => (
            <g key={i}>
              <circle
                cx="65"
                cy={70 + i * 75}
                r="17"
                fill={colors[i]}
                opacity=".7"
              />
              <rect
                x="110"
                y={53 + i * 75}
                width={400}
                height="34"
                rx="5"
                fill="currentColor"
                opacity=".06"
              />
              <rect
                x="110"
                y={53 + i * 75}
                width={[350, 230, 390, 170][i]}
                height="34"
                rx="5"
                fill={colors[i]}
                opacity=".65"
              />
            </g>
          ))}
          <path
            d="M420 35V340"
            stroke="currentColor"
            strokeDasharray="5 6"
            opacity=".4"
          />
        </g>
      );
    case 'skills':
      return (
        <g>
          {[0, 1, 2, 3, 4].map((row) =>
            [0, 1, 2, 3, 4, 5].map((col) => (
              <rect
                key={`${row}-${col}`}
                x={100 + col * 65}
                y={35 + row * 63}
                width="52"
                height="50"
                rx="9"
                fill={colors[(row + col) % 4]}
                opacity={0.12 + ((row * 3 + col) % 5) * 0.17}
              />
            ))
          )}
          <path
            d="M65 45v300h455"
            stroke="currentColor"
            opacity=".3"
            fill="none"
          />
        </g>
      );
    case 'onboarding':
      return (
        <g>
          <Wire
            d="M75 285C150 285 125 80 240 80S325 285 425 285 465 100 545 100"
            tone={1}
          />
          {[
            [75, 285],
            [240, 80],
            [425, 285],
            [545, 100],
          ].map(([x, y], i) => (
            <g key={i}>
              <circle
                cx={x}
                cy={y}
                r="30"
                fill="var(--background)"
                stroke={colors[i]}
                strokeWidth="2"
              />
              <text
                x={x}
                y={y! + 6}
                textAnchor="middle"
                fill="currentColor"
                fontSize="15"
              >
                0{i + 1}
              </text>
            </g>
          ))}
          <path
            d="M90 130h70m-70 20h45M350 80h80m-80 20h50"
            stroke="currentColor"
            opacity=".2"
            strokeWidth="6"
          />
        </g>
      );
    case 'evidence':
      return (
        <g>
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <circle
                cx={110 + i * 190}
                cy="165"
                r="70"
                fill="none"
                stroke="currentColor"
                strokeOpacity=".07"
                strokeWidth="20"
              />
              <circle
                cx={110 + i * 190}
                cy="165"
                r="70"
                fill="none"
                stroke={colors[i]}
                strokeWidth="20"
                strokeDasharray="220 440"
                transform={`rotate(${-90 + i * 35} ${110 + i * 190} 165)`}
              />
              <path
                d={`M${90 + i * 190} 165l15 15 25-30`}
                stroke={colors[i]}
                fill="none"
                strokeWidth="4"
              />
              <path
                d={`M${60 + i * 190} 290h100m-85 18h70`}
                stroke="currentColor"
                opacity=".2"
                strokeWidth="5"
              />
            </g>
          ))}
        </g>
      );
    default:
      return null;
  }
}
