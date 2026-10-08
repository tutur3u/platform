import { createProfileMediaPutHandler } from '@/lib/profile-media-upload-put';

export { profileMediaUploadOptions as OPTIONS } from '@/lib/profile-media-upload-cors';
export const PUT = createProfileMediaPutHandler('banner');
