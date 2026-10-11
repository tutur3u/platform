const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (['node_modules', '.mintlify'].includes(entry.name)) return [];
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

function navigationPages(value, insidePages = false, result = []) {
  if (typeof value === 'string' && insidePages) result.push(value);
  else if (Array.isArray(value))
    for (const item of value) navigationPages(item, insidePages, result);
  else if (value && typeof value === 'object')
    for (const [key, item] of Object.entries(value))
      navigationPages(item, key === 'pages', result);
  return result;
}

function audit(root = ROOT) {
  const docs = path.join(root, 'apps/docs');
  const config = JSON.parse(
    fs.readFileSync(path.join(docs, 'docs.json'), 'utf8')
  );
  const pages = navigationPages(config.navigation);
  const registered = new Set(pages);
  const redirects = new Set(
    (config.redirects ?? []).map((entry) => entry.source.replace(/^\//, ''))
  );
  const errors = [];
  const files = walk(docs).filter((file) => file.endsWith('.mdx'));
  const exists = (slug) =>
    ['.mdx', '.md'].some((extension) =>
      fs.existsSync(path.join(docs, slug + extension))
    );
  for (const slug of pages)
    if (!exists(slug)) errors.push(`Missing navigation page: ${slug}`);
  for (const slug of pages)
    if (pages.indexOf(slug) !== pages.lastIndexOf(slug))
      errors.push(`Duplicate navigation page: ${slug}`);
  for (const file of files) {
    const relative = path.relative(docs, file).split(path.sep).join('/');
    const slug = relative.slice(0, -4);
    const source = fs.readFileSync(file, 'utf8');
    if (!registered.has(slug) && !redirects.has(slug))
      errors.push(`Unregistered page: ${slug}`);
    if (
      !/^---\r?\n[\s\S]*?^title:\s*.+[\s\S]*?^description:\s*.+[\s\S]*?^---/m.test(
        source
      )
    )
      errors.push(`Missing title/description: ${relative}`);
    // Ignore runnable/example fenced code; internal author links should resolve.
    const content = source
      .replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '')
      .replace(/`[^`\n]*`/g, '');
    const targets = [
      ...[...content.matchAll(/(?<!!)\[[^\]]+\]\(([^\s)]+)/g)].map(
        (match) => match[1]
      ),
      ...[...content.matchAll(/\bhref=["'](\/[^"']+)["']/g)].map(
        (match) => match[1]
      ),
    ];
    for (const target of targets) {
      if (/^(?:[a-z][a-z\d+.-]*:|#)/i.test(target)) continue;
      const clean = target.split(/[?#]/)[0];
      if (!clean) continue;
      const candidate = clean.startsWith('/')
        ? path.join(docs, clean.slice(1))
        : path.resolve(path.dirname(file), clean);
      const relativeTarget = path
        .relative(docs, candidate)
        .split(path.sep)
        .join('/');
      if (relativeTarget.startsWith('../')) continue; // Source references outside docs.
      if (fs.existsSync(candidate)) continue;
      const pageSlug = relativeTarget
        .replace(/\.(mdx|md)$/, '')
        .replace(/\/$/, '');
      if (!exists(pageSlug) && !redirects.has(pageSlug))
        errors.push(`Broken internal link: ${relative} -> ${target}`);
    }
    for (const image of content.matchAll(
      /(?:!\[[^\]]*\]\(|\bsrc=["'])(\/[^\s)"']+)/g
    )) {
      const target = image[1].split(/[?#]/)[0];
      if (!fs.existsSync(path.join(docs, target.slice(1))))
        errors.push(`Missing asset: ${relative} -> ${target}`);
    }
  }
  for (const entry of config.redirects ?? []) {
    if (entry.source === entry.destination)
      errors.push(`Self redirect: ${entry.source}`);
    if (!exists(entry.destination.replace(/^\//, '')))
      errors.push(`Missing redirect target: ${entry.destination}`);
  }
  return {
    errors: [...new Set(errors)],
    pageCount: files.length,
    navigationCount: registered.size,
  };
}

module.exports = { audit, navigationPages };
if (require.main === module) {
  const result = audit();
  console.log(
    `Docs audit: ${result.pageCount} pages, ${result.navigationCount} navigation entries, ${result.errors.length} errors`
  );
  for (const error of result.errors) console.error(error);
  process.exitCode = result.errors.length ? 1 : 0;
}
