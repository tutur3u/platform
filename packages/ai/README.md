# @tuturuuu/ai

AI utilities and helpers for Tuturuuu Platform.

## Chat SDK

`@tuturuuu/ai/chat-sdk` exposes the Vercel Chat SDK core, `chat/ai`
tool helpers, and a Tuturuuu adapter registry for omni-channel agentic
presence workflows.

The registry covers every adapter currently listed at
https://chat-sdk.dev/adapters:

- Official platform adapters: Slack, Microsoft Teams, Google Chat, Discord,
  GitHub, Linear, Telegram, WhatsApp Business Cloud, Messenger, and Web.
- Vendor-official platform adapters: Beeper Matrix, Photon iMessage, Resend,
  Zernio, and Liveblocks.
- Community platform adapters: Webex, Baileys WhatsApp, Sendblue, Blooio, Zalo,
  and Mattermost.
- State adapters: Memory, Redis, ioredis, PostgreSQL, Cloudflare Durable
  Objects, and MySQL.

```ts
import {
  createChatSdkRuntime,
  createChatTools,
} from '@tuturuuu/ai/chat-sdk';

const chat = await createChatSdkRuntime({
  userName: 'mira',
  adapters: {
    slack: true,
    zalo: {
      botToken: process.env.ZALO_BOT_TOKEN,
      webhookSecret: process.env.ZALO_WEBHOOK_SECRET,
    },
  },
  state: {
    id: 'redis',
    config: { url: process.env.REDIS_URL },
  },
});

const tools = createChatTools({
  chat,
  preset: 'messenger',
});
```

Use a production state adapter for deployed bots so subscriptions,
deduplication, and distributed webhook locks survive restarts. The memory state
adapter is only for local development and tests.

## Installation

```bash
npm install @tuturuuu/ai
# or
yarn add @tuturuuu/ai
# or
bun add @tuturuuu/ai
```

## Development

```bash
# Install dependencies
bun install

# Run tests
bun run test
```

## License

MIT © [Tuturuuu](https://github.com/tutur3u)
