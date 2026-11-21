import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  classifyRouteFile,
  exportedMethods,
} from '../../../../packages/start-bridge/src/codegen/registry';
import { classifyInfrastructureRoute } from './route-classification';

export function inventoryInfrastructureRoutes(appRoot: string) {
  const config = JSON.parse(
    readFileSync(join(appRoot, 'start-bridge.routes.json'), 'utf8')
  );
  const root = join(appRoot, config.appDir);
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() && /^(route|page)\.[cm]?[jt]sx?$/.test(entry.name)
    )
    .map((entry) => {
      const file = relative(root, join(entry.parentPath, entry.name));
      const route = classifyRouteFile(file, config.stripSegments);
      if (!route || 'error' in route)
        throw new Error(`Unenumerable route: ${file}`);
      const source = readFileSync(join(root, file), 'utf8');
      const methods = route.kind === 'page' ? ['GET'] : exportedMethods(source);
      if (!methods?.length) throw new Error(`Unenumerable methods: ${file}`);
      return {
        file,
        path: route.pattern,
        methods: methods.map((method) => ({
          method,
          classification: classifyInfrastructureRoute(route.pattern, method),
        })),
      };
    })
    .sort((a, b) => a.file.localeCompare(b.file));
}
