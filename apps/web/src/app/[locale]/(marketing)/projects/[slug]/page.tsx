'use client';

import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';

const GLBViewerCanvas = dynamic(
  () => import('./3d-model').then((m) => m.GLBViewerCanvas),
  { ssr: false }
);

export default function Project3DPage() {
  const search = useSearchParams();
  const modelFile = search.get('src'); // ?src=/media/glb/threedudeonecar.glb

  return (
    <div className="relative h-screen w-screen">
      <div className="absolute inset-0 flex items-center justify-center">
        <img
          src="/media/logos/nct-logo-dark-nbg.png"
          alt="Background Logo"
          className="h-[100vh] w-[100vw] object-contain opacity-20"
        />
      </div>

      {/* Canvas Area */}
      <div className="h-full w-full">
        {modelFile ? (
          <GLBViewerCanvas modelUrl={modelFile} autoRotate scale={1.2} />
        ) : (
          <div className="flex h-full items-center justify-center text-white">
            No model file provided.
          </div>
        )}
      </div>
    </div>
  );
}
