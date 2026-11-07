import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

// Only products with public marketing pages belong in this public snapshot.
const products = [
  ['ai', 'AI', 'ai'], ['calendar', 'Calendar', 'calendar'],
  ['chat', 'Chat', 'chat'], ['contacts', 'CRM', 'crm'], ['drive', 'Drive', 'drive'],
  ['finance', 'Finance', 'finance'], ['forms', 'Forms', 'forms'],
  ['hive', 'Hive', 'hive'], ['inventory', 'Inventory', 'inventory'],
  ['mail', 'Mail', 'mail'], ['meet', 'Meet', 'meet-together'],
  ['storefront', 'Storefront', 'storefront'], ['tasks', 'Tasks', 'tasks'],
  ['track', 'Track', 'track'],
];
const sourceCommit = process.argv[2];
if (!/^[a-f0-9]{40}$/.test(sourceCommit ?? '')) {
  throw new Error('Supply an immutable 40-character public source commit');
}
const read = (path) => execFileSync('git', ['show', `${sourceCommit}:${path}`], { encoding: 'utf8' });
const files = execFileSync('git', ['ls-tree', '-r', '--name-only', sourceCommit, '--', 'apps'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).split('\n');
const policy = read('tuturuuu.ci.ts');
const checkedAt = new Date().toISOString();
const source = `https://github.com/tutur3u/platform/blob/${sourceCommit}/`;
const apps = products.map(([id, name, product]) => {
  const marketing = `apps/web/src/app/[locale]/(marketing)/products/${product}/page.tsx`;
  if (!files.includes(marketing)) throw new Error(`Public product evidence missing: ${id}`);
  const config = files.find((path) => path.startsWith(`apps/${id}/vite.config.`));
  const native = Boolean(config && /tanstackStart/.test(read(config)) && /voidPlugin/.test(read(config)));
  let status = native ? 'active' : 'planned';
  let summary = native
    ? { en: 'Start + Void configuration is in main; live migration is not verified.', vi: 'Cấu hình Start + Void đã có trên main; chưa xác minh chuyển đổi trên production.' }
    : { en: 'Part of the web migration target; a merged Start + Void configuration is not established by this snapshot.', vi: 'Thuộc mục tiêu chuyển đổi web; bản cập nhật này chưa xác nhận cấu hình Start + Void đã hợp nhất.' };
  const evidence = [{ label: 'Public product', url: source + marketing }];
  if (native) evidence.push({ label: 'Source configuration', url: source + config });
  // Publish only the public state, never operational or security reason strings.
  const held = new RegExp(`\\b${id}:\\s*\\{\\s*state:\\s*'held'`).test(policy);
  const admitted = new RegExp(`\\b${id}:\\s*\\{\\s*state:\\s*'admitted'`).test(policy);
  if (held) {
    status = 'blocked';
    summary = { en: 'Source work is in main; production cutover awaits publication approval.', vi: 'Mã nguồn đã có trên main; chuyển đổi production đang chờ duyệt phát hành.' };
  }
  if (admitted) {
    summary = { en: 'Publication is permitted. That permission alone does not verify the live migration.', vi: 'Đã được phép phát hành. Quyền phát hành chưa xác nhận chuyển đổi trên production.' };
  }
  if (held || admitted) evidence.push({ label: 'Public publication policy', url: source + 'tuturuuu.ci.ts' });
  if (!native) evidence.push({ label: 'Migration target', url: source + 'apps/docs/build/devops/native-start-migration.mdx' });
  return { id, name, productUrl: `https://tuturuuu.com/products/${product}`, status, summary, evidence, checkedAt };
});
writeFileSync(new URL('../src/snapshot.json', import.meta.url), JSON.stringify({ sourceCommit, checkedAt, apps }, null, 2) + '\n');
console.log(`Refreshed ${apps.length} allowlisted public products from ${sourceCommit}; no live deployment claims`);
