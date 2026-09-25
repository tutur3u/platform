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
    default:
      return null;
  }
}
