import { colors, Dot, Wire } from './scene-primitives';
export function OpenGeometry({ id }: { id: string }) {
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
  return null;
}
