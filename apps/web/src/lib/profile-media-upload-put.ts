import {
  consumeProfileUploadTicket,
  PROFILE_MEDIA_MAX_BYTES,
  type ProfileMediaKind,
  ProfileUploadError,
} from '@tuturuuu/storage-core/profile-upload-budget';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { verifyAppCoordinationToken } from '@tuturuuu/utils/app-coordination-token';
import { NextResponse } from 'next/server';
import { optimizeProfileMedia } from './profile-media-optimize';
import { publicStorageUrl } from './profile-media-public-url';
import { readProfileMediaBody } from './profile-media-upload-body';

/** SQL-defined service-role RPC pending generated-schema refresh. */
type BannerOperationStatusRpc = (
  name: 'profile_banner_operation_status',
  args: { p_user_id: string; p_operation_id: string }
) => PromiseLike<{ data: unknown; error: unknown }>;

function isIssuedBannerOperation(data: unknown, path: string | undefined) {
  return (
    typeof data === 'object' &&
    data !== null &&
    'state' in data &&
    data.state === 'issued' &&
    'file_path' in data &&
    typeof data.file_path === 'string' &&
    data.file_path === path
  );
}

/** A signed capability, not a logged-in upload: preserves native/offline clients. */
export function createProfileMediaPutHandler(kind: ProfileMediaKind) {
  return async (request: Request) => {
    try {
      const token = new URL(request.url).searchParams.get('token');
      if (!token || token.length > 4096)
        throw new ProfileUploadError('Invalid upload ticket', 401);
      const verified = verifyAppCoordinationToken(token);
      if (
        !verified.ok ||
        verified.claims.target_app !== 'profile-media-upload' ||
        ![1, 2].includes(verified.claims.scopes.length) ||
        verified.claims.scopes[0] !== `profile-media:${kind}` ||
        !/^[0-9a-f-]{36}$/i.test(verified.claims.sub) ||
        !/^[0-9a-f-]{36}$/i.test(verified.claims.jti) ||
        verified.claims.exp - verified.claims.iat > 600
      )
        throw new ProfileUploadError('Invalid upload ticket', 401);
      const workspace = verified.claims.scopes[1];
      const bannerOperation =
        kind === 'banner' && workspace?.startsWith('banner-operation:')
          ? workspace.slice(17)
          : undefined;
      if (kind === 'banner' && !bannerOperation)
        throw new ProfileUploadError('Invalid upload ticket', 401);
      const avatarPrefix = workspace?.startsWith('avatar-prefix:')
        ? workspace.slice(14)
        : undefined;
      if (
        workspace &&
        (bannerOperation
          ? !/^[0-9a-f-]{36}$/i.test(bannerOperation)
          : kind !== 'avatar' ||
            !(avatarPrefix
              ? /^[0-9a-f-]{36}\/users(?:\/profile-link\/[a-zA-Z0-9_-]{1,100})?$/i.test(
                  avatarPrefix
                )
              : /^workspace:[0-9a-f-]{36}$/i.test(workspace)))
      )
        throw new ProfileUploadError('Invalid upload ticket', 401);
      const contentType = request.headers
        .get('content-type')
        ?.split(';')[0]
        ?.trim();
      if (
        !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(
          contentType ?? ''
        )
      )
        throw new ProfileUploadError('Unsupported profile image', 400);
      await consumeProfileUploadTicket(verified.claims.jti);
      const admin = await createAdminClient({ noCookie: true });
      const operationPath = bannerOperation
        ? `${verified.claims.sub}/${bannerOperation}.webp`
        : undefined;
      if (bannerOperation) {
        const operationStatus = admin.rpc.bind(
          admin
        ) as unknown as BannerOperationStatusRpc;
        const receipt = await operationStatus(
          'profile_banner_operation_status',
          {
            p_user_id: verified.claims.sub,
            p_operation_id: bannerOperation,
          }
        );
        if (receipt.error)
          throw new ProfileUploadError('Banner lifecycle unavailable', 503);
        if (!isIssuedBannerOperation(receipt.data, operationPath))
          throw new ProfileUploadError('Banner operation changed', 409);
      }
      const original = await readProfileMediaBody(
        request,
        PROFILE_MEDIA_MAX_BYTES[kind]
      );
      const optimized = await optimizeProfileMedia(original, kind);
      const bucket = admin.storage.from(
        kind === 'avatar' ? 'avatars' : 'banners'
      );
      const filePath = bannerOperation
        ? `${verified.claims.sub}/${bannerOperation}.webp`
        : avatarPrefix
          ? `${avatarPrefix}/${verified.claims.jti}.webp`
          : workspace
            ? `workspaces/${workspace.slice(10)}/avatar-${verified.claims.jti}.webp`
            : `${verified.claims.sub}/${verified.claims.jti}.webp`;
      const publicUrl = publicStorageUrl(
        bucket.getPublicUrl(filePath).data.publicUrl
      );
      const { error } = await bucket.upload(filePath, optimized, {
        contentType: 'image/webp',
        upsert: false,
        cacheControl: '31536000',
      });
      if (error)
        throw new ProfileUploadError(
          'Unable to store optimized profile image',
          503
        );
      return NextResponse.json(
        { publicUrl, bytes: optimized.length },
        {
          headers: { 'Cache-Control': 'no-store' },
        }
      );
    } catch (error) {
      if (error instanceof ProfileUploadError)
        return NextResponse.json(
          { message: error.message },
          { status: error.status }
        );
      console.error('Unable to optimize profile media upload');
      return NextResponse.json(
        { message: 'Profile upload unavailable' },
        { status: 503 }
      );
    }
  };
}
