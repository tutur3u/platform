import { SphereGeometry } from 'three';

export function LightBulb(props: any) {
  return (
    <mesh position={[0, 0, 0]} {...props}>
      <pointLight castShadow />
      <primitive object={new SphereGeometry(0.2, 30, 10)} />
      <meshPhongMaterial emissive={'yellow'} />
    </mesh>
  );
}
