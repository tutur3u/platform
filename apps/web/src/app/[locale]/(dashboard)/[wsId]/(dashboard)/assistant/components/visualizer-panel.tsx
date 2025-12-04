'use client';

import { AnimatePresence, motion } from 'framer-motion';
import type { RefObject } from 'react';
import { Altair } from './altair/component';

interface VisualizerPanelProps {
  videoRef: RefObject<HTMLVideoElement | null> | RefObject<HTMLVideoElement>;
  videoStream: MediaStream | null;
}

export function VisualizerPanel({
  videoRef,
  videoStream,
}: VisualizerPanelProps) {
  return (
    <motion.div
      className="h-full w-[480px] border-border/50 border-l bg-muted/10 backdrop-blur"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
    >
      <div className="flex h-full flex-col gap-6 overflow-y-auto p-6">
        {/* Visualization */}
        <div className="flex-1 rounded-2xl bg-muted/20 p-4 ring-1 ring-border/10 backdrop-blur">
          {!videoStream ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <p className="text-sm">No visualization data</p>
            </div>
          ) : (
            <Altair />
          )}
        </div>

        {/* Video */}
        <AnimatePresence>
          {videoStream ? (
            <motion.video
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="aspect-video w-full rounded-2xl bg-muted/20 object-cover ring-1 ring-border/10"
              ref={videoRef}
              autoPlay
              playsInline
            />
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="flex aspect-video items-center justify-center rounded-2xl bg-muted/20 text-muted-foreground"
            >
              <p className="text-sm">No video input</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
