import {
  type MockApp,
  type MockRecord,
  mockApps,
  requireRule,
  text,
} from '@tuturuuu/multiplayer';
import type { Env } from './env';
import { sponsoredImage } from './sponsored-ai';

export async function executeImageTool(
  env: Env,
  records: MockRecord[],
  input: Record<string, unknown>
) {
  const app = text(input.app, 30) as MockApp;
  requireRule(mockApps.includes(app), 'unknown_mock_app');
  const prompt = text(input.prompt, 3000);
  const title = text(input.title ?? 'Generated artwork', 150);
  const alt = text(input.alt ?? title, 300).replace(/[[\]\\]/g, '');
  requireRule(env.storeGeneratedImage, 'image_unavailable', 503);
  requireRule(
    records.filter((record) => record.app === app).length < 100,
    'mock_limit'
  );
  const image = await sponsoredImage(env, prompt);
  const url = await env.storeGeneratedImage(image);
  const record = {
    id: crypto.randomUUID(),
    app,
    title,
    content: `![${alt}](${url})\n\n${prompt}\n\nAI-generated artwork. Review text, visual accuracy, rights, and accessibility before publishing.`,
  };
  records.push(record);
  return JSON.stringify({ record, imageUrl: url, generated: true });
}
