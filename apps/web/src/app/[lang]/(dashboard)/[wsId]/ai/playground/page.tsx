'use client';

import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Canvas } from '@react-three/fiber';
import { useState } from 'react';
import { BoxGeometry } from 'three';

interface Size {
  x: number;
  y: number;
  z: number;
}

function Cube({ size }: { size: Size }) {
  return (
    <mesh receiveShadow>
      <primitive object={new BoxGeometry(size.x, size.z, size.y)} />
      <meshStandardMaterial color="gray" />
    </mesh>
  );
}

export default function AIPlaygroundPage() {
  const [size, setSize] = useState<Size>({
    x: 1,
    y: 1,
    z: 1,
  });

  return (
    <div className="h-[calc(100vh-12rem)] w-full">
      <div className="grid gap-2 lg:grid-cols-3">
        <div className="flex gap-2">
          <Input
            placeholder="X"
            value={size.x}
            onChange={(e) => {
              const value = Number(e.target.value);

              // If value is not a number, do nothing
              if (e.target.value !== '' && (isNaN(value) || !e.target.value))
                return;

              setSize((s) => ({
                ...s,
                x: value < 0 ? 0 : value > 100 ? 100 : value,
              }));
            }}
          />
          <Slider
            defaultValue={[1]}
            max={100}
            step={1}
            value={[size.x]}
            onValueChange={(v) => setSize((s) => ({ ...s, x: v[0] }))}
          />
        </div>

        <div className="flex gap-2">
          <Input
            placeholder="Y"
            value={size.y}
            onChange={(e) => {
              const value = Number(e.target.value);

              // If value is not a number, do nothing
              if (e.target.value !== '' && (isNaN(value) || !e.target.value))
                return;

              setSize((s) => ({
                ...s,
                y: value < 0 ? 0 : value > 100 ? 100 : value,
              }));
            }}
          />
          <Slider
            defaultValue={[1]}
            max={100}
            step={1}
            value={[size.y]}
            onValueChange={(v) => setSize((s) => ({ ...s, y: v[0] }))}
          />
        </div>

        <div className="flex gap-2">
          <Input
            placeholder="Z"
            value={size.z}
            onChange={(e) => {
              const value = Number(e.target.value);

              // If value is not a number, do nothing
              if (e.target.value !== '' && (isNaN(value) || !e.target.value))
                return;

              setSize((s) => ({
                ...s,
                z: value < 0 ? 0 : value > 100 ? 100 : value,
              }));
            }}
          />
          <Slider
            defaultValue={[1]}
            max={100}
            step={1}
            value={[size.z]}
            onValueChange={(v) => setSize((s) => ({ ...s, z: v[0] }))}
          />
        </div>
      </div>

      <Canvas
        shadows
        className="bg-foreground/5 border-foreground/10 mt-2 h-full w-full rounded-lg border"
        camera={{
          position: [-6, 7, 7],
        }}
      >
        <ambientLight intensity={2} />
        <Cube size={size} />
      </Canvas>
    </div>
  );
}
