import { LiveAudioPlayer } from './audio';

/** Each assistant owns its queue; interruption never drains another speaker. */
export class RoomAudioPlayers {
  private players = new Map<string, LiveAudioPlayer>();
  private enabled = false;
  private muted = false;
  private outputDeviceId = '';
  private generation = 0;
  constructor(private onError: () => void) {}
  activate(id: string) {
    if (this.players.has(id)) return;
    const player = new LiveAudioPlayer();
    this.players.set(id, player);
    if (this.muted) player.close();
    else if (this.enabled)
      void player.unlock(this.outputDeviceId).catch(this.onError);
  }
  deactivate(id: string) {
    this.players.get(id)?.close();
    this.players.delete(id);
  }
  play(id: string, data: string) {
    this.players.get(id)?.play(data);
  }
  interrupt(id: string) {
    this.players.get(id)?.interrupt();
  }
  async unlock(outputDeviceId: string) {
    const generation = ++this.generation;
    this.outputDeviceId = outputDeviceId;
    this.enabled = true;
    this.muted = false;
    try {
      await Promise.all(
        [...this.players.values()].map((player) =>
          player.unlock(outputDeviceId)
        )
      );
      return generation === this.generation && this.enabled;
    } catch (error) {
      if (generation !== this.generation) return false;
      this.mute();
      throw error;
    }
  }
  mute() {
    ++this.generation;
    this.enabled = false;
    this.muted = true;
    for (const player of this.players.values()) player.close();
  }
  clear() {
    this.mute();
    for (const player of this.players.values()) player.close();
    this.players.clear();
  }
}
