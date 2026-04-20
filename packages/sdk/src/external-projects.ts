import {
  EpmClient,
  type EpmClientConfig as ExternalProjectsClientConfig,
  isYoolaExternalProjectLoadingData,
} from './epm';

export type { ExternalProjectsClientConfig };

export class ExternalProjectsClient extends EpmClient {}

export { isYoolaExternalProjectLoadingData };
