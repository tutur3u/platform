import { buildInfo, health } from './domains/metadata';
import { mobileVersion } from './domains/mobile';
import { workspaceEndpoints } from './domains/workspaces';
import { validateRegistry } from './registry';

export const endpoints = [
  health,
  buildInfo,
  mobileVersion,
  ...workspaceEndpoints,
];
validateRegistry(endpoints);
