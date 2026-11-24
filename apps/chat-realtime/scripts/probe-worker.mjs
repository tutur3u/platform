// Node child for the ticket probe. The Cloudflare Vite plugin refuses to load
// cloudflare.config.ts under Bun, so workerd starts here and the parent stays
// on Bun for the TypeScript ticket signer.
import { startCfViteWorker } from '../../../scripts/ci/cf-vite-worker.mjs';

const root = process.argv[2];
const secret = process.env.CHAT_REALTIME_PROBE_SECRET ?? '';
if (!root || secret.length < 32) {
  console.error('probe worker: missing root or secret');
  process.exit(1);
}

process.chdir(root);
const worker = await startCfViteWorker({
  mode: 'source',
  root,
  secrets: {
    CHAT_REALTIME_STOPPED: 'false',
    CHAT_REALTIME_TOKEN_SECRET: secret,
  },
});

let closed = false;
const close = async () => {
  if (closed) return;
  closed = true;
  await worker.close();
};
process.stdin.on('end', () => {
  close().then(
    () => process.exit(0),
    () => process.exit(1)
  );
});
process.stdin.resume();
console.log(worker.origin);
