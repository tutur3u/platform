import { buildInfo, health } from './domains/metadata';
import { mobileVersion } from './domains/mobile';
import { validateRegistry } from './registry';

export const endpoints = [health, buildInfo, mobileVersion];
validateRegistry(endpoints);
