import { handleMailRequest } from '#mail-handler';
export default {
  fetch: handleMailRequest,
} satisfies ExportedHandler<CloudflareEnv>;
