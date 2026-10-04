import { RealtimeChannel } from './channel';
import {
  type ChannelOptions,
  channelTopicSchema,
  type RealtimeIdentity,
  type RealtimeJoin,
} from './schema';
export class CloudflareRealtimeClient {
  private channels = new Set<RealtimeChannel>();
  readonly auth: {
    getUser: () => Promise<{
      data: { user: RealtimeIdentity | null };
      error: Error | null;
    }>;
  };
  constructor(
    private join: (topic: string) => Promise<RealtimeJoin>,
    identity: () => Promise<RealtimeIdentity>
  ) {
    this.auth = {
      getUser: async () => {
        try {
          return { data: { user: await identity() }, error: null };
        } catch (error) {
          return {
            data: { user: null },
            error:
              error instanceof Error
                ? error
                : new Error('Authentication required'),
          };
        }
      },
    };
  }
  channel(topic: string, options: ChannelOptions = {}) {
    const validated = channelTopicSchema.parse(topic);
    const channel = new RealtimeChannel(validated, options, () =>
      this.join(validated)
    );
    this.channels.add(channel);
    return channel;
  }
  async removeChannel(channel: RealtimeChannel) {
    this.channels.delete(channel);
    return channel.unsubscribe();
  }
  async removeAllChannels() {
    await Promise.all(
      [...this.channels].map((channel) => this.removeChannel(channel))
    );
  }
}
