import type { SfuTracksResponse } from './sfu-response';
export function assertPublishedResponse(
  response: SfuTracksResponse | undefined
): asserts response is SfuTracksResponse & {
  sessionDescription: RTCSessionDescriptionInit;
} {
  if (
    !response ||
    response.errorCode ||
    response.tracks?.some((track) => track.errorCode) ||
    response.sessionDescription?.type !== 'answer'
  )
    throw new Error('sfu_track_publish_failed');
}
