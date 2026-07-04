import {
  EpmClient,
  type EpmClientConfig as ExternalProjectsClientConfig,
  isExocorpseExternalProjectLoadingData,
  isYoolaExternalProjectLoadingData,
} from './epm';

export type { ExternalProjectPublicAssetUpload } from './external-projects-public-assets';
export {
  getExternalProjectPublicAssetFilename,
  getExternalProjectPublicAssetPublicPath,
  getExternalProjectPublicAssetStoragePath,
  getExternalProjectPublicAssetUploads,
  linkExternalProjectPublicFolderAssets,
} from './external-projects-public-assets';

export type { ExternalProjectsClientConfig };

export class ExternalProjectsClient extends EpmClient {}

export {
  isExocorpseExternalProjectLoadingData,
  isYoolaExternalProjectLoadingData,
};
