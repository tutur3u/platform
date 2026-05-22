'use client';

import { Html } from '@react-three/drei';
import type { HiveRealtimeAwareness } from '../../../engine/types';

type RealtimePresenceMarkersProps = {
  awareness: HiveRealtimeAwareness[];
};

export function RealtimePresenceMarkers({
  awareness,
}: RealtimePresenceMarkersProps) {
  return (
    <>
      {awareness.map((user) => {
        const cursor = user.cursor ?? user.worldPosition;
        if (!cursor) return null;

        return (
          <group
            key={user.userId}
            position={[cursor.x, Math.max(0.42, cursor.y + 0.08), cursor.z]}
          >
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.34, 0.4, 24]} />
              <meshBasicMaterial color={user.color} transparent opacity={0.9} />
            </mesh>
            <mesh position={[0, 0.4, 0]}>
              <sphereGeometry args={[0.08, 12, 12]} />
              <meshBasicMaterial color={user.color} />
            </mesh>
            <Html center distanceFactor={10} position={[0, 0.78, 0]}>
              <div className="pointer-events-none whitespace-nowrap rounded-md border border-border/60 bg-background/90 px-2 py-1 font-medium text-[11px] text-foreground shadow-lg">
                {user.displayName}
              </div>
            </Html>
          </group>
        );
      })}
    </>
  );
}
