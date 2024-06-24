'use client';

import { AmbientPopover } from './ambient-popover';
import { CameraController } from './camera-controller';
import { CameraPopover } from './camera-popover';
import { Cube } from './cube';
import { CubePopover } from './cube-popover';
import { LightBulb } from './light-bulb';
import ResetButton from './reset-button';
import { Size } from './types';
import { Canvas } from '@react-three/fiber';
import { useState } from 'react';

const defaultSize: Size = {
  x: 100,
  y: 100,
  z: 3,
};

const defaultCameraPosition: Size = {
  x: 0,
  y: 2,
  z: 5,
};

export default function AIPlaygroundPage() {
  const [size, setSize] = useState(defaultSize);
  const [intensity, setIntensity] = useState(1);
  const [cameraPosition, setCameraPosition] = useState(defaultCameraPosition);
  const [cameraQuaternion, setCameraQuaternion] = useState([0, 0, 0, 0]);

  const disableReset =
    size.x === defaultSize.x &&
    size.y === defaultSize.y &&
    size.z === defaultSize.z &&
    intensity === 1 &&
    cameraPosition.x === defaultCameraPosition.x &&
    cameraPosition.y === defaultCameraPosition.y &&
    cameraPosition.z === defaultCameraPosition.z &&
    cameraQuaternion[0] === 0 &&
    cameraQuaternion[1] === 0 &&
    cameraQuaternion[2] === 0 &&
    cameraQuaternion[3] === 0;

  return (
    <div className="relative h-[calc(100vh-10rem)] w-full">
      <div className="absolute right-2 top-2 z-50 flex gap-2">
        <ResetButton
          onClick={() => {
            setSize(defaultSize);
            setIntensity(1);
            setCameraPosition(defaultCameraPosition);
            setCameraQuaternion([0, 0, 0, 0]);
          }}
          disabled={disableReset}
        />
        <AmbientPopover intensity={intensity} setIntensity={setIntensity} />
        <CameraPopover
          position={cameraPosition}
          quaternion={cameraQuaternion}
          setPosition={setCameraPosition}
          setQuaternion={setCameraQuaternion}
        />
        <CubePopover size={size} setSize={setSize} />
      </div>
      <Canvas
        className="bg-foreground/5 border-foreground/10 mt-2 h-full w-full rounded-lg border"
        shadows
      >
        <ambientLight intensity={intensity} />
        <LightBulb position={[0, 2, 2]} intensity={1} />
        <CameraController
          position={cameraPosition}
          quaternion={cameraQuaternion}
        />
        <Cube size={size} />
      </Canvas>
    </div>
  );
}
