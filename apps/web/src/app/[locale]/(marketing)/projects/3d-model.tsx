'use client';

import { LoadingIndicator } from '@ncthub/ui/custom/loading-indicator';
import {
  Bounds,
  Center,
  Html,
  OrbitControls,
  useGLTF,
} from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import Image from 'next/image';
import { Suspense, useRef } from 'react';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

interface ModelProps {
  url: string;
  scale?: number;
}

function Model({ url, scale = 1 }: ModelProps) {
  const { scene } = useGLTF(url);
  return (
    <Center>
      <primitive object={scene} scale={scale} />
    </Center>
  );
}

export interface GLBViewerCanvasProps {
  modelUrl: string;
  enableControls?: boolean;
  autoRotate?: boolean;
  scale?: number;
}

export function GLBViewerCanvas({
  modelUrl,
  enableControls = true,
  autoRotate = false,
  scale = 0.5,
}: GLBViewerCanvasProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null);

  return (
    <div className="relative h-[45vh] max-h-[80vh] min-h-[300px] w-full rounded-2xl border border-border bg-gradient-to-br from-background/95 to-primary/5 shadow-lg sm:h-[55vh] md:h-[65vh] xl:h-[70vh]">
      {/* Background image layer */}
      <Image
        src="/media/logos/nct-logo-dark-nbg.png" // <-- change to your image
        alt=""
        fill
        priority
        className="pointer-events-none z-0 object-contain object-center opacity-40 select-none"
      />

      <Canvas
        camera={{ position: [0, 2, 3], fov: 50 }}
        style={{ background: 'transparent', height: '100%', width: '100%' }}
      >
        <Suspense
          fallback={
            <Html center>
              <LoadingIndicator className="h-8 w-8" />
            </Html>
          }
        >
          {/* Lights */}
          <ambientLight intensity={0.05} />
          <directionalLight castShadow position={[10, 10, 5]} intensity={0.5} />
          <pointLight position={[-10, -10, -5]} intensity={0.5} />

          {/* Model */}
          <Bounds fit clip observe margin={1.5}>
            <Model url={modelUrl} scale={scale} />
          </Bounds>

          {/* Orbit controls */}
          {enableControls && (
            <OrbitControls
              ref={controlsRef}
              autoRotate={autoRotate}
              autoRotateSpeed={1}
              enablePan
              enableZoom
              enableRotate
              maxPolarAngle={Math.PI}
              minDistance={0.05}
              maxDistance={1}
            />
          )}
        </Suspense>
      </Canvas>
    </div>
  );
}

// Preload helper
export function preloadGLTF(url: string) {
  useGLTF.preload(url);
}
