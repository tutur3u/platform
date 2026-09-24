# Shared meeting runtime

Meet and Parley use this package for call UI, media/device lifecycle, SFU tokens,
chat, transcripts, recording, and Mira text/live audio. Meet retains import shims
so existing route and feature consumers do not move in the same release.

`NEXT_PUBLIC_MEETING_APP` is a build-time discriminator: omitted means Meet;
`parley` selects Parley's identity and scenario authorization. Never derive it
from a request header or user input. Each app owns its routing, message bundles,
public assets, Cloudflare entrypoint, app secrets and deployment. Parley uses Meet’s private provider service binding and live Durable Object namespace; the provider credential remains with Meet.

Parley scenarios and references are database content. Do not place customer
materials in source, fixtures, examples, migrations, logs or snapshots. Shared
runtime tests use synthetic content only.
