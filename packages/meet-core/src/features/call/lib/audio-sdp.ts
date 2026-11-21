import { readMeetMediaFlags } from './media-flags';

type Description = { sdp: string; type: 'offer' | 'answer' };

/** MIDs of microphone senders, identified by their `speech` content hint. */
export function microphoneMids(pc: RTCPeerConnection) {
  return new Set(
    pc
      .getTransceivers()
      .flatMap(({ mid, sender }) =>
        mid !== null && sender.track?.contentHint === 'speech' ? [mid] : []
      )
  );
}

function withParams(params: string, wanted: Record<string, string>) {
  const entries = params
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry) => !(entry.split('=')[0]! in wanted));
  return [
    ...entries,
    ...Object.entries(wanted).map(([key, value]) => `${key}=${value}`),
  ].join(';');
}

function rewriteSection(lines: string[], dtx: boolean) {
  const opus = new Set(
    lines.flatMap((line) => {
      const match = /^a=rtpmap:(\d+) opus\/48000/i.exec(line);
      return match ? [match[1]!] : [];
    })
  );
  if (!opus.size) return lines;
  const wanted = { useinbandfec: '1', usedtx: dtx ? '1' : '0' };
  const seen = new Set<string>();
  const output = lines.map((line) => {
    const match = /^a=fmtp:(\d+) (.*)$/.exec(line);
    if (!match || !opus.has(match[1]!)) return line;
    seen.add(match[1]!);
    return `a=fmtp:${match[1]} ${withParams(match[2]!, wanted)}`;
  });
  // An Opus payload without an fmtp line gets one right after its rtpmap.
  return output.flatMap((line) => {
    const match = /^a=rtpmap:(\d+) opus\/48000/i.exec(line);
    return match && !seen.has(match[1]!)
      ? [line, `a=fmtp:${match[1]} ${withParams('', wanted)}`]
      : [line];
  });
}

/**
 * Ask our Opus encoders for in-band FEC, and microphones for DTX, by setting
 * them in the SFU's answer. FEC lets receivers rebuild a lost speech frame
 * from the next packet; DTX sends almost nothing during silence, freeing the
 * uplink in large rooms. Screen audio never uses DTX so quiet passages of
 * shared media are not gated. Each audio section is rewritten on its own,
 * because payload numbers are scoped per media section.
 */
export function withOpusResilience<T extends Description | undefined>(
  description: T,
  micMids: ReadonlySet<string>,
  dtx = readMeetMediaFlags().opusDtx
): T {
  if (!description?.sdp) return description;
  const eol = description.sdp.includes('\r\n') ? '\r\n' : '\n';
  const sections: string[][] = [[]];
  for (const line of description.sdp.split(eol)) {
    if (line.startsWith('m=')) sections.push([]);
    sections.at(-1)!.push(line);
  }
  let changed = false;
  const rewritten = sections.map((section, index) => {
    if (index === 0 || !section[0]?.startsWith('m=audio ')) return section;
    const mid = section
      .find((line) => line.startsWith('a=mid:'))
      ?.slice(6)
      .trim();
    const next = rewriteSection(
      section,
      mid !== undefined && micMids.has(mid) ? dtx : false
    );
    changed ||= next.join(eol) !== section.join(eol);
    return next;
  });
  if (!changed) return description;
  return { ...description, sdp: rewritten.flat().join(eol) };
}
