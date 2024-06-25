import { Size } from './types';
import { BoxGeometry } from 'three';

export function Cube({ size }: { size: Size }) {
  return (
    <mesh castShadow receiveShadow>
      <primitive object={new BoxGeometry(size.x, size.z, size.y)} />
      <meshStandardMaterial color="gray" />
    </mesh>
  );
}
