import { Size } from './types';
import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';

export function CameraController({
  position,
  quaternion,
}: {
  position: Size;
  quaternion: number[];
}) {
  const { camera } = useThree(); // Access the camera

  useEffect(() => {
    camera.position.x = position.x;
    camera.position.y = position.y;
    camera.position.z = position.z;

    camera.quaternion.x = quaternion[0] / 360;
    camera.quaternion.y = quaternion[1] / 360;
    camera.quaternion.z = quaternion[2] / 360;
    camera.quaternion.w = quaternion[3] / 360;

    camera.updateProjectionMatrix();
  }, [camera, position, quaternion]);

  return null;
}
