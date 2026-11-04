import type { CmsPageVersionPayload } from '@tuturuuu/cms-blocks/schema';

export type PageVersionHandler = (
  payload: CmsPageVersionPayload
) => Promise<void>;

export interface PageBuilderActionProps {
  /** From `getCmsWorkspaceAccess().canPublishPages`; editors without it never see Publish. */
  canPublishPages: boolean;
  onPublish?: PageVersionHandler;
  onSaveDraft?: PageVersionHandler;
}

/** Which actions to show: drafts for every editor, publish only with the publish permission. */
export function getVisiblePageBuilderActions({
  canPublishPages,
  onPublish,
  onSaveDraft,
}: PageBuilderActionProps) {
  return {
    publish: canPublishPages && Boolean(onPublish),
    saveDraft: Boolean(onSaveDraft),
  };
}
