import { readMeetMediaFlags } from './media-flags';

type Description = { sdp: string; type: 'offer' | 'answer' };

/**
 * Ask our Opus encoder for in-band FEC and DTX by adding them to the SFU's
 * answer. FEC lets receivers rebuild a lost speech frame from the next packet;
 * DTX sends almost nothing during silence, which in a large room frees the
 * uplink for whoever is talking. Other codecs and parameters are untouched.
 */
export function withOpusResilience<T extends Description | undefined>(
  description: T,
  dtx = readMeetMediaFlags().opusDtx
): T {
  if (!description?.sdp) return description;
  const eol = description.sdp.includes('\r\n') ? '\r\n' : '\n';
  const lines = description.sdp.split(eol);
  const opus = new Set(
    lines.flatMap((line) => {
      const match = /^a=rtpmap:(\d+) opus\/48000/i.exec(line);
      return match ? [match[1]!] : [];
    })
  );
  if (!opus.size) return description;
  const wanted: Record<string, string> = {
    useinbandfec: '1',
    ...(dtx ? { usedtx: '1' } : {}),
  };
  const withParams = (params: string) => {
    const entries = params
      .split(';')
      .map((entry) => entry.trim())
      .filter(Boolean);
    const keys = new Set(entries.map((entry) => entry.split('=')[0]));
    for (const [key, value] of Object.entries(wanted))
      if (!keys.has(key)) entries.push(`${key}=${value}`);
    return entries.join(';');
  };
  const seen = new Set<string>();
  const output = lines.map((line) => {
    const match = /^a=fmtp:(\d+) (.*)$/.exec(line);
    if (!match || !opus.has(match[1]!)) return line;
    seen.add(match[1]!);
    return `a=fmtp:${match[1]} ${withParams(match[2]!)}`;
  });
  // An Opus payload without an fmtp line gets one right after its rtpmap.
  const result = output.flatMap((line) => {
    const match = /^a=rtpmap:(\d+) opus\/48000/i.exec(line);
    return match && !seen.has(match[1]!)
      ? [line, `a=fmtp:${match[1]} ${withParams('')}`]
      : [line];
  });
  return { ...description, sdp: result.join(eol) };
}
