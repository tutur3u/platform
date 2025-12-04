'use client';

import { Camera, Monitor, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { AnimatePresence, motion } from 'framer-motion';
import { memo, useEffect, useRef } from 'react';

export type VideoPreviewProps = {
  stream: MediaStream | null;
  type: 'webcam' | 'screen' | null;
  onClose?: () => void;
};

function VideoPreview({ stream, type, onClose }: VideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <AnimatePresence>
      {stream && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="absolute right-4 bottom-32 z-30 md:right-6 md:bottom-36"
        >
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/40 shadow-2xl backdrop-blur-xl">
            {/* Header */}
            <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-black/20 px-3 py-2">
              <div className="flex items-center gap-2">
                {type === 'webcam' ? (
                  <Camera className="h-4 w-4 text-emerald-400" />
                ) : (
                  <Monitor className="h-4 w-4 text-blue-400" />
                )}
                <span className="font-medium text-white/80 text-xs">
                  {type === 'webcam' ? 'Camera' : 'Screen Share'}
                </span>
              </div>
              {onClose && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-white/60 hover:bg-white/10 hover:text-white"
                  onClick={onClose}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>

            {/* Video container */}
            <div className="relative">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-auto w-48 object-cover md:w-56"
                style={{ transform: type === 'webcam' ? 'scaleX(-1)' : 'none' }}
              />

              {/* Live indicator */}
              <div className="absolute top-2 left-2 flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-1 backdrop-blur-sm">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
                <span className="font-medium text-white/90 text-[10px] uppercase tracking-wide">
                  Live
                </span>
              </div>
            </div>

            {/* Footer with stream info */}
            <div className="border-t border-white/10 bg-black/20 px-3 py-1.5">
              <StreamInfo stream={stream} />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function StreamInfo({ stream }: { stream: MediaStream }) {
  const videoTrack = stream.getVideoTracks()[0];
  const settings = videoTrack?.getSettings();

  if (!settings) return null;

  return (
    <div className="flex items-center gap-3 text-white/50 text-[10px]">
      {settings.width && settings.height && (
        <span>
          {settings.width}x{settings.height}
        </span>
      )}
      {settings.frameRate && <span>{Math.round(settings.frameRate)} fps</span>}
    </div>
  );
}

export default memo(VideoPreview);
