import { colors, Dot, Wire } from './scene-primitives';
export function OpenGeometry({ id }: { id: string }) {
  if (id === 'ecosystem')
    return (
      <g>
        <path
          d="M35 125 H565"
          stroke="currentColor"
          strokeDasharray="5 7"
          opacity=".2"
        />
        {[0, 1, 2, 3].map((i) => (
          <g key={i} transform={`translate(${115 + i * 100},30)`}>
            <rect
              width="65"
              height="65"
              rx="15"
              fill={colors[i]}
              fillOpacity=".12"
              stroke={colors[i]}
            />
            <path
              d="M18 23 h29 M18 33 h18 M18 43 h24"
              stroke={colors[i]}
              strokeWidth="3"
              strokeLinecap="round"
            />
            <Wire d="M33 65 V95" tone={i} />
          </g>
        ))}
        {[0, 1, 2].map((i) => (
          <g key={i} transform={`translate(${70 - i * 12},${153 + i * 70})`}>
            <path
              d={`M0 0 h${460 + i * 24} l25 20 -25 22 H0 l-25-22Z`}
              fill={colors[i]}
              fillOpacity=".1"
              stroke={colors[i]}
            />
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <Dot key={n} x={45 + n * 73} y={20} r={5} tone={i} />
            ))}
          </g>
        ))}
        <Wire d="M100 195 v28 M500 195 v28 M85 265 v28 M515 265 v28" tone={1} />
      </g>
    );
  if (id === 'openness')
    return (
      <g>
        <path
          d="M210 175 V100 a90 90 0 0 1 174-30"
          fill="none"
          stroke={colors[1]}
          strokeWidth="16"
          strokeLinecap="round"
        />
        <rect
          x="175"
          y="165"
          width="250"
          height="170"
          rx="25"
          fill={colors[1]}
          fillOpacity=".1"
          stroke={colors[1]}
          strokeWidth="2"
        />
        <path
          d="m260 218-30 30 30 30 m80-60 30 30-30 30 M315 205 l-30 85"
          stroke={colors[1]}
          strokeWidth="6"
          fill="none"
          strokeLinecap="round"
        />
        <Wire
          d="M175 225 H80 V95 M425 230 H510 V110 M300 335 V365"
          dashed
          tone={2}
        />
        <Dot x={80} y={95} r={10} tone={2} />
        <Dot x={510} y={110} r={10} tone={0} />
      </g>
    );
  if (id === 'independence')
    return (
      <g>
        {[0, 1, 2].map((i) => (
          <g key={i} transform={`translate(${65 + i * 185},${240 - i * 75})`}>
            <path
              d="M0 0 h105 v100 H0Z"
              fill={colors[i]}
              fillOpacity=".12"
              stroke={colors[i]}
            />
            <path
              d="M25 30 h55 M25 46 h35 M25 62 h45"
              stroke={colors[i]}
              strokeWidth="5"
              strokeLinecap="round"
            />
            <circle
              cx="53"
              cy="-28"
              r="18"
              fill="var(--background)"
              stroke={colors[i]}
            />
            {i === 0 ? (
              <path
                d="m45-28 6 6 10-13"
                fill="none"
                stroke={colors[i]}
                strokeWidth="3"
              />
            ) : (
              <Dot x={53} y={-28} r={4} tone={i} />
            )}
          </g>
        ))}
        <Wire d="M170 280 h40 v-75 h40 M355 205 h40 v-75 h40" tone={1} dashed />
        <path d="M50 360 H570" stroke="currentColor" opacity=".15" />
      </g>
    );
  return null;
}
