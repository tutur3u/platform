export type BandwidthMode = 'auto' | 'saver' | 'quality';
export function encodingBudget(
  kind: string,
  mode: BandwidthMode,
  available: number | null,
  roundTripMs: number | null
) {
  if (kind === 'audio' || kind === 'screen_audio')
    return { maxBitrate: kind === 'audio' ? 48000 : 96000 };
  const constrained =
    mode === 'saver' ||
    (available !== null && available < 650000) ||
    (roundTripMs !== null && roundTripMs > 500);
  if (kind === 'screen')
    return {
      maxBitrate: constrained ? 600000 : 1800000,
      maxFramerate: constrained ? 8 : 15,
      scaleResolutionDownBy: 1,
    };
  return constrained
    ? { maxBitrate: 300000, maxFramerate: 15, scaleResolutionDownBy: 2 }
    : {
        maxBitrate: mode === 'quality' ? 1600000 : 900000,
        maxFramerate: 24,
        scaleResolutionDownBy: 1,
      };
}
/** Change sender limits in-place. Never rebuild transport or mute audio when bandwidth drops. */
export function watchSenderBandwidth({
  readPeer,
  readSenders,
  mode,
  hasAudience,
}: {
  readPeer: () => RTCPeerConnection | null;
  readSenders: () => Map<string, RTCRtpSender>;
  mode: () => BandwidthMode;
  hasAudience: () => boolean;
}) {
  let active = true,
    running = false;
  const applied = new WeakMap<RTCRtpSender, string>();
  let good = 0,
    constrained = false;
  const update = async () => {
    if (running || !active) return;
    const pc = readPeer();
    if (pc?.connectionState !== 'connected' || pc.signalingState !== 'stable')
      return;
    running = true;
    try {
      let available: number | null = null,
        rtt: number | null = null;
      const stats = await pc.getStats();
      for (const stat of stats.values())
        if (
          stat.type === 'candidate-pair' &&
          stat.state === 'succeeded' &&
          (stat.nominated || stat.selected)
        ) {
          if (
            Number.isFinite(stat.availableOutgoingBitrate) &&
            stat.availableOutgoingBitrate >= 0
          )
            available = stat.availableOutgoingBitrate;
          if (
            Number.isFinite(stat.currentRoundTripTime) &&
            stat.currentRoundTripTime >= 0
          )
            rtt = stat.currentRoundTripTime * 1000;
        }
      if (
        (available !== null && available < 650000) ||
        (rtt !== null && rtt > 500)
      ) {
        constrained = true;
        good = 0;
      } else if (available !== null || rtt !== null) {
        good = Math.min(4, good + 1);
        if (good === 4) constrained = false;
      } else good = 0;
      const senders = [...readSenders().entries()];
      for (const [name, sender] of senders) {
        if (!active || readPeer() !== pc) break;
        if (!sender.track) continue;
        const kind = name.includes('screen_audio')
          ? 'screen_audio'
          : name.includes('screen')
            ? 'screen'
            : sender.track.kind;
        const budget = encodingBudget(
          kind,
          constrained ? 'saver' : mode(),
          available,
          rtt
        );
        // Share the congestion estimate across video senders, reserving speech bandwidth.
        if (available !== null && sender.track.kind === 'video')
          budget.maxBitrate = Math.max(
            1,
            Math.min(
              budget.maxBitrate,
              Math.floor(
                ((available - 144000) * 0.8) /
                  Math.max(
                    1,
                    senders.filter(([, s]) => s.track?.kind === 'video').length
                  )
              )
            )
          );
        // Below the speech reserve, suspend video instead of spending a minimum
        // video bitrate that could starve audio. Keep the track so recovery does
        // not require capture permissions or another SFU negotiation.
        const videoSuspended =
          sender.track.kind === 'video' &&
          available !== null &&
          budget.maxBitrate < 32000;
        const target = {
          ...budget,
          active: hasAudience() && !videoSuspended,
        };
        const signature = JSON.stringify(target);
        if (applied.get(sender) === signature) continue;
        const parameters = sender.getParameters();
        if (!parameters.encodings?.length) continue;
        parameters.encodings = parameters.encodings.map((encoding) => ({
          ...encoding,
          ...target,
        }));
        try {
          await sender.setParameters(parameters);
          applied.set(sender, signature);
        } catch {
          /* Unsupported browser controls must not interrupt a working call. */
        }
      }
    } catch {
      /* Transient stats failure keeps the previous limits. */
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void update(), 3000);
  void update();
  return {
    refresh: () => void update(),
    dispose: () => {
      active = false;
      clearInterval(timer);
    },
  };
}
