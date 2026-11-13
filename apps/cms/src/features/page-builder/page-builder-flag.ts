/** Workspace config row (`workspace_configs`) that turns the page builder on per workspace; absent means off. */
export const ENABLE_CMS_PAGE_BUILDER_CONFIG_ID = 'ENABLE_CMS_PAGE_BUILDER';

export function isPageBuilderEnabled(value: string | null | undefined) {
  return value?.trim().toLowerCase() === 'true';
}
