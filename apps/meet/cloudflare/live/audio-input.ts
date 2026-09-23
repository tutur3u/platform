import type { Session } from '@google/genai/web';

/** Only flush a stream that actually received audio; repeated mutes are inert. */
export class LiveAudioInput {
  private window = { start: 0, bytes: 0 };
  private pending = false;
  send(provider: Session, data: string) {
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(data) || !data.length) return;
    if (Date.now() - this.window.start >= 1000)
      this.window = { start: Date.now(), bytes: 0 };
    this.window.bytes += data.length;
    if (this.window.bytes > 90000) return;
    provider.sendRealtimeInput({
      audio: { data, mimeType: 'audio/pcm;rate=16000' },
    });
    this.pending = true;
  }
  end(provider?: Session) {
    if (!this.pending || !provider) return;
    provider.sendRealtimeInput({ audioStreamEnd: true });
    this.pending = false;
  }
}
