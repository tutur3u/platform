import fs from 'node:fs';
import path from 'node:path';

const here = import.meta.dirname;
const repo = path.resolve(here, '../../../..');
/** Map real package source exports, including packages normally requiring dist.
 * No ambient fake modules or dependency builds are used. */
export function prepareTypecheck() {
  const paths = { '@/*': [path.join(repo, 'apps/learn/src/*')] };
  for (const directory of fs.readdirSync(path.join(repo, 'packages'))) {
    const packageRoot = path.join(repo, 'packages', directory);
    const manifest = path.join(packageRoot, 'package.json');
    if (!fs.existsSync(manifest)) continue;
    const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    if (!pkg.exports || !pkg.name) continue;
    for (const [key, value] of Object.entries(pkg.exports)) {
      const target =
        typeof value === 'string'
          ? value
          : (value.import ?? value.types ?? value.default);
      if (typeof target !== 'string') continue;
      let source = target
        .replace(/^\.\/dist\//, './src/')
        .replace(/\.d\.ts$/, '.ts')
        .replace(/\.m?js$/, '.ts');
      if (
        !source.includes('*') &&
        !fs.existsSync(path.join(packageRoot, source))
      ) {
        const alternatives = [
          source.replace(/\.ts$/, '.tsx'),
          source.replace(/\.ts$/, '/index.ts'),
          source.replace(/\.ts$/, '/index.tsx'),
        ];
        source =
          alternatives.find((candidate) =>
            fs.existsSync(path.join(packageRoot, candidate))
          ) ?? source;
        if (!fs.existsSync(path.join(packageRoot, source))) continue;
      }
      paths[pkg.name + (key === '.' ? '' : key.slice(1))] = [
        path.join(packageRoot, source),
      ];
    }
  }
  fs.writeFileSync(
    path.join(here, 'tsconfig.json'),
    JSON.stringify(
      {
        extends: path.join(repo, 'apps/learn/tsconfig.json'),
        compilerOptions: {
          noEmit: true,
          incremental: false,
          composite: false,
          paths,
        },
        include: [
          path.join(here, '*.tsx'),
          path.join(here, 'judge.ts'),
          path.join(
            repo,
            'apps/learn/src/app/[locale]/(dashboard)/[wsId]/coding/*.tsx'
          ),
          path.join(
            repo,
            'apps/learn/src/app/[locale]/(dashboard)/[wsId]/coding/coding-font.ts'
          ),
          path.join(
            repo,
            'apps/learn/src/app/[locale]/(dashboard)/[wsId]/structure.tsx'
          ),
        ],
        exclude: ['node_modules'],
      },
      null,
      2
    )
  );
}
