interface VideoStatsProps {
  stream: MediaStream | null;
}

export function VideoStats({ stream }: VideoStatsProps) {
  if (!stream) return null;

  const videoTrack = stream.getVideoTracks()[0];
  const settings = videoTrack?.getSettings();

  return (
    <div className="rounded-xl bg-neutral-800/30 p-3">
      <div className="grid grid-cols-2 gap-3 text-sm">
        {settings && (
          <div className="space-y-2">
            <div className="flex flex-col">
              <span className="text-neutral-400">Resolution</span>
              <span className="font-medium text-neutral-200">
                {settings.width}×{settings.height}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-neutral-400">Frame Rate</span>
              <span className="font-medium text-neutral-200">
                {settings.frameRate?.toFixed(1)} fps
              </span>
            </div>
          </div>
        )}
        <div className="space-y-2">
          {videoTrack && (
            <div className="flex flex-col">
              <span className="text-neutral-400">Source</span>
              <span className="truncate font-medium text-neutral-200">
                {videoTrack.label}
              </span>
            </div>
          )}
          <div className="flex flex-col">
            <span className="text-neutral-400">Status</span>
            <span className="font-medium text-emerald-400">Active</span>
          </div>
        </div>
      </div>
    </div>
  );
}
