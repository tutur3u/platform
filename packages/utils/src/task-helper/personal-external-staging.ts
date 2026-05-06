export const PERSONAL_EXTERNAL_STAGING_LIST_ID_PREFIX =
  'personal-external-staging:';

export function getPersonalExternalStagingListId(boardId: string) {
  return `${PERSONAL_EXTERNAL_STAGING_LIST_ID_PREFIX}${boardId}`;
}

export function getPersonalExternalStagingBoardId(listId: string | null) {
  if (
    !listId?.startsWith(PERSONAL_EXTERNAL_STAGING_LIST_ID_PREFIX) ||
    listId.length <= PERSONAL_EXTERNAL_STAGING_LIST_ID_PREFIX.length
  ) {
    return null;
  }

  return listId.slice(PERSONAL_EXTERNAL_STAGING_LIST_ID_PREFIX.length);
}

export function isPersonalExternalStagingListId(listId: string | null) {
  return getPersonalExternalStagingBoardId(listId) !== null;
}
