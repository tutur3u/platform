import type { JSONContent } from '@tiptap/react';
import { resolveStoredWorkspaceStorageUrl } from '@tuturuuu/storage-core/signed-url-policy';

/**
 * Older documents embed one-year signed Storage URLs for their images. On
 * load, rewrite signed `workspaces` URLs into the stable
 * sign-on-read share URL, so images stay readable after the old token expires
 * and saving the document no longer persists a bearer token.
 */
export function resolveDocumentImageSources(content: JSONContent): JSONContent {
  const src = content.attrs?.src;
  const attrs =
    content.type === 'image' && typeof src === 'string'
      ? { ...content.attrs, src: resolveStoredWorkspaceStorageUrl(src) }
      : content.attrs;
  const children = content.content?.map((child) =>
    resolveDocumentImageSources(child)
  );
  return {
    ...content,
    ...(attrs ? { attrs } : {}),
    ...(children ? { content: children } : {}),
  };
}
