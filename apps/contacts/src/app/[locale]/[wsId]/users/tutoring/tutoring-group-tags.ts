import { listWorkspaceGroupTags } from '@tuturuuu/internal-api';
import type { UserGroupTag } from '@tuturuuu/types/primitives/UserGroupTag';

const PAGE_SIZE = 100;
const MAX_PAGES = 50;

/** Tag names per class, as the tutoring exclusion rules read them. */
export function groupTagNamesById(tags: readonly UserGroupTag[]) {
  const byGroup = new Map<string, string[]>();
  for (const tag of tags) {
    if (!tag.name) continue;
    for (const groupId of tag.group_ids ?? [])
      byGroup.set(groupId, [...(byGroup.get(groupId) ?? []), tag.name]);
  }
  return byGroup;
}

/**
 * Every workspace class tag, read only when the tutoring policy has a tag
 * rule, so the class picker, suggestions and queue filter apply tag rules as
 * the server does.
 */
export async function loadTutoringGroupTags(
  wsId: string,
  list: typeof listWorkspaceGroupTags = listWorkspaceGroupTags
) {
  const tags: UserGroupTag[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const result = await list(wsId, { page, pageSize: PAGE_SIZE });
    tags.push(...result.data);
    if (!result.data.length || tags.length >= result.count) break;
  }
  return groupTagNamesById(tags);
}
