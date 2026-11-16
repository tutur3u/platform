# @tuturuuu/ai

AI utilities and helpers for Tuturuuu Platform.

## Token accounting

Pass the AI SDK's total `outputTokens` to credit helpers. Reasoning is a subset
of that total; keep `reasoningTokens` separately for display and attribution.
Do not subtract it before calling `deductAiCredits` or
`calculateAiStudioUsageCost`.

`credits/token-usage` owns normalization and the adapter for the SQL pricing
contract. The SQL functions and execution ledger use disjoint output and
reasoning buckets, so `toLegacyTokenPricing` subtracts reasoning exactly once
at that boundary. For example, 20 SDK output tokens including 8 reasoning tokens
become 12 output plus 8 reasoning tokens in the pricing RPC. API responses and
chat completion counts retain the total of 20. Do not normalize those disjoint
buckets a second time. Native provider usage with separate candidate and thought
counts must first be converted to the SDK total-output convention.

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

Published artifacts replace local `workspace:*` dependencies with exact
registry versions before packing. If a public consumer cannot install this
package, rerun the package release from the current production commit so its
manifest points at published Tuturuuu package versions.

## Development

```bash
# Install dependencies
bun install

# Run tests
bun run test
```

## License

MIT © [Tuturuuu](https://github.com/tutur3u)
