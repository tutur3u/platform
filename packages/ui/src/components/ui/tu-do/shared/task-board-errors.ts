export const TASK_BOARD_NAME_EXISTS_CODE = 'TASK_BOARD_NAME_EXISTS';
export const TASK_LIST_NAME_EXISTS_CODE = 'TASK_LIST_NAME_EXISTS';

function hasErrorCode(error: unknown, code: string) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  );
}

export function isTaskBoardNameExistsError(error: unknown) {
  return hasErrorCode(error, TASK_BOARD_NAME_EXISTS_CODE);
}

export function isTaskListNameExistsError(error: unknown) {
  return hasErrorCode(error, TASK_LIST_NAME_EXISTS_CODE);
}
