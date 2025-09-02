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
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { ArrowBigLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
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
  scale = 0.5
}: GLBViewerCanvasProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const router = useRouter();
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[#181826]">
      <div className="h-[80vh] w-[80vw] overflow-hidden rounded-3xl border-2 border-gray-700 shadow-2xl">


        <div className="absolute top-4 left-4 z-50 flex items-center gap-2">
          <motion.button
            onClick={() => {
              router.back();
            }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#24a4db] to-[#1AF4E6] px-6 py-3 font-medium text-black transition-all duration-200 hover:shadow-lg hover:shadow-[#24a4db]/30"
          >
            <ArrowBigLeft size={20} />
            <span>Return</span>
          </motion.button>
        </div>


        <Canvas
          camera={{ position: [0, 2, 3], fov: 50 }}
          style={{ background: "transparent"}}
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
            <directionalLight
              castShadow
              position={[10, 10, 5]}
              intensity={0.5}
            />
            <pointLight position={[-10, -10, -5]} intensity={0.5} />

            {/* Model */}
            <Bounds fit clip observe margin={1.1}>
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
    </div>
  );
}

// Preload helper
export function preloadGLTF(url: string) {
  useGLTF.preload(url);
}
