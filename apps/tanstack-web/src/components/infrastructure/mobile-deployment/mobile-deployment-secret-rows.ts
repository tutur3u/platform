import type {
  MobileDeploymentResourceStatus,
  MobileDeploymentScalarName,
} from '@tuturuuu/internal-api/infrastructure/mobile';
import {
  MOBILE_DEPLOYMENT_ENV_KEYS,
  MOBILE_DEPLOYMENT_SCALAR_NAMES,
} from './mobile-deployment-config';
import type { MobileDeploymentSecretRowModel } from './mobile-deployment-secret-row';

export function buildMobileDeploymentSecretRows({
  envKeys,
  scalarValues,
}: {
  envKeys: MobileDeploymentResourceStatus[];
  scalarValues: MobileDeploymentResourceStatus[];
}) {
  const envPresetNames = new Set<string>(MOBILE_DEPLOYMENT_ENV_KEYS);
  const envStatusByName = new Map(envKeys.map((entry) => [entry.name, entry]));
  const scalarStatusByName = new Map(
    scalarValues.map((entry) => [entry.name, entry])
  );

  const scalarRows: MobileDeploymentSecretRowModel[] =
    MOBILE_DEPLOYMENT_SCALAR_NAMES.map((name: MobileDeploymentScalarName) => ({
      kind: 'scalar',
      name,
      nameEditable: false,
      preset: true,
      status: scalarStatusByName.get(name),
    }));
  const envPresetRows: MobileDeploymentSecretRowModel[] =
    MOBILE_DEPLOYMENT_ENV_KEYS.map((name) => ({
      kind: 'env',
      name,
      nameEditable: false,
      preset: true,
      status: envStatusByName.get(name),
    }));
  const customRows: MobileDeploymentSecretRowModel[] = envKeys
    .filter((entry) => !envPresetNames.has(entry.name))
    .map((entry) => ({
      kind: 'env',
      name: entry.name,
      nameEditable: true,
      preset: false,
      status: entry,
    }));

  return [...scalarRows, ...envPresetRows, ...customRows];
}

export function filterMobileDeploymentSecretRows({
  query,
  rows,
}: {
  query: string;
  rows: MobileDeploymentSecretRowModel[];
}) {
  const normalizedQuery = query.trim().toUpperCase();

  if (!normalizedQuery) {
    return rows;
  }

  return rows.filter((row) => row.name.includes(normalizedQuery));
}
