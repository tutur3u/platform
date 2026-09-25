import { DiagramMark } from '../capabilities/product-mark';
import { colors, Dot } from './scene-primitives';
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
          <DiagramMark product="tuturuuu" x={272} y={162} size={56} />
        </g>
      );
    default:
      return null;
  }
}
