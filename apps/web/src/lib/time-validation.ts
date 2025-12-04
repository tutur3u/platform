import dayjs from 'dayjs';

/**
 * Error codes for time validation
 */
export type TimeValidationErrorCode =
  | 'FUTURE_DATE_TIME'
  | 'FUTURE_START_TIME'
  | 'FUTURE_END_TIME'
  | 'FUTURE_ENTRY_DATE'
  | 'FUTURE_SESSION_UPDATE'
  | 'END_BEFORE_START'
  | 'DURATION_TOO_SHORT'
  | 'REQUIRES_APPROVAL'
  | 'ALL_EDITS_REQUIRE_APPROVAL'
  | 'SESSION_TOO_OLD_TO_EDIT'
  | 'START_TIME_TOO_OLD';

export interface TimeValidationResult {
  isValid: boolean;
  errorCode?: TimeValidationErrorCode;
  /** Additional context for the error (e.g., formatted date, threshold days) */
  errorParams?: Record<string, string | number>;
}

export interface ThresholdValidationResult extends TimeValidationResult {
  requiresApproval: boolean;
}

/**
 * Validates that a date/time is not in the future
 * @param dateTimeString - ISO date time string or datetime-local input value
 * @returns Object with validation result and error code if invalid
 */
export function validateNotFuture(
  dateTimeString: string | null | undefined
): TimeValidationResult {
  if (!dateTimeString) {
    return { isValid: true }; // Empty is considered valid (required validation should be separate)
  }

  const dateTime = dayjs(dateTimeString);
  const now = dayjs();

  if (dateTime.isAfter(now)) {
    const formattedDateTime = dateTime.format('MMM D, YYYY [at] h:mm A');
    return {
      isValid: false,
      errorCode: 'FUTURE_DATE_TIME',
      errorParams: { dateTime: formattedDateTime },
    };
  }

  return { isValid: true };
}

/**
 * Validates that start time is not in the future
 * @param startTimeString - Start time string
 * @returns Object with validation result and error code if invalid
 */
export function validateStartTime(
  startTimeString: string | null | undefined
): TimeValidationResult {
  const result = validateNotFuture(startTimeString);
  if (!result.isValid) {
    const formattedDateTime = dayjs(startTimeString).format('MMM D, YYYY [at] h:mm A');
    return {
      isValid: false,
      errorCode: 'FUTURE_START_TIME',
      errorParams: { dateTime: formattedDateTime },
    };
  }
  return { isValid: true };
}

/**
 * Validates that end time is not in the future
 * @param endTimeString - End time string
 * @returns Object with validation result and error code if invalid
 */
export function validateEndTime(
  endTimeString: string | null | undefined
): TimeValidationResult {
  const result = validateNotFuture(endTimeString);
  if (!result.isValid) {
    const formattedDateTime = dayjs(endTimeString).format('MMM D, YYYY [at] h:mm A');
    return {
      isValid: false,
      errorCode: 'FUTURE_END_TIME',
      errorParams: { dateTime: formattedDateTime },
    };
  }
  return { isValid: true };
}

/**
 * Validates time range (end is after start and both are not future)
 * @param startTimeString - Start time string
 * @param endTimeString - End time string
 * @returns Object with validation result and error code if invalid
 */
export function validateTimeRange(
  startTimeString: string | null | undefined,
  endTimeString: string | null | undefined
): TimeValidationResult {
  // Validate individual times first
  const startValidation = validateStartTime(startTimeString);
  if (!startValidation.isValid) {
    return startValidation;
  }

  const endValidation = validateEndTime(endTimeString);
  if (!endValidation.isValid) {
    return endValidation;
  }

  if (!startTimeString || !endTimeString) {
    return { isValid: true }; // Missing values handled by required validation
  }

  const startTime = dayjs(startTimeString);
  const endTime = dayjs(endTimeString);

  if (endTime.isBefore(startTime)) {
    return {
      isValid: false,
      errorCode: 'END_BEFORE_START',
    };
  }

  if (endTime.diff(startTime, 'minutes') < 1) {
    return {
      isValid: false,
      errorCode: 'DURATION_TOO_SHORT',
    };
  }

  return { isValid: true };
}

/**
 * Validates that start time is within the allowed threshold for missed entries
 * @param startTimeString - Start time string
 * @param thresholdDays - Number of days allowed (null means no restriction, 0 means all require approval)
 * @returns Object with validation result and error code if invalid
 */
export function validateMissedEntryThreshold(
  startTimeString: string | null | undefined,
  thresholdDays: number | null
): ThresholdValidationResult {
  if (!startTimeString) {
    return { isValid: true, requiresApproval: false };
  }

  const startTime = dayjs(startTimeString);
  const now = dayjs();

  // First check if it's a future time (never allowed)
  if (startTime.isAfter(now)) {
    const formattedDateTime = startTime.format('MMM D, YYYY [at] h:mm A');
    return {
      isValid: false,
      requiresApproval: false,
      errorCode: 'FUTURE_ENTRY_DATE',
      errorParams: { dateTime: formattedDateTime },
    };
  }

  // If threshold is null, no approval needed
  if (thresholdDays === null) {
    return { isValid: true, requiresApproval: false };
  }

  // If threshold is 0, all entries require approval
  if (thresholdDays === 0) {
    return { isValid: true, requiresApproval: true };
  }

  // Check if start time is older than threshold days
  const thresholdAgo = now.subtract(thresholdDays, 'day');
  if (startTime.isBefore(thresholdAgo)) {
    return {
      isValid: true,
      requiresApproval: true,
      errorCode: 'REQUIRES_APPROVAL',
      errorParams: { days: thresholdDays },
    };
  }

  return { isValid: true, requiresApproval: false };
}

/**
 * Validates that a session can be edited based on its original start time
 * @param originalStartTime - Original start time of the session
 * @param newStartTime - New start time (optional)
 * @param thresholdDays - Number of days allowed for editing
 * @returns Object with validation result and error code if invalid
 */
export function validateSessionEdit(
  originalStartTime: string,
  newStartTime: string | undefined,
  thresholdDays: number | null
): TimeValidationResult {
  const now = dayjs();
  const originalStart = dayjs(originalStartTime);

  // If threshold is null, no restrictions
  if (thresholdDays === null) {
    // Still need to check for future times
    if (newStartTime && dayjs(newStartTime).isAfter(now)) {
      const futureTime = dayjs(newStartTime);
      const formattedDateTime = futureTime.format('MMM D, YYYY [at] h:mm A');
      return {
        isValid: false,
        errorCode: 'FUTURE_SESSION_UPDATE',
        errorParams: { dateTime: formattedDateTime },
      };
    }
    return { isValid: true };
  }

  // If threshold is 0, no edits allowed to time fields
  if (thresholdDays === 0) {
    return {
      isValid: false,
      errorCode: 'ALL_EDITS_REQUIRE_APPROVAL',
    };
  }

  // Check if original session is older than threshold
  const thresholdAgo = now.subtract(thresholdDays, 'day');
  if (originalStart.isBefore(thresholdAgo)) {
    return {
      isValid: false,
      errorCode: 'SESSION_TOO_OLD_TO_EDIT',
      errorParams: { days: thresholdDays },
    };
  }

  // Check if new start time (if provided) is older than threshold
  if (newStartTime) {
    const newStart = dayjs(newStartTime);
    if (newStart.isBefore(thresholdAgo)) {
      return {
        isValid: false,
        errorCode: 'START_TIME_TOO_OLD',
        errorParams: { days: thresholdDays },
      };
    }

    // Check for future times
    if (newStart.isAfter(now)) {
      const formattedDateTime = newStart.format('MMM D, YYYY [at] h:mm A');
      return {
        isValid: false,
        errorCode: 'FUTURE_SESSION_UPDATE',
        errorParams: { dateTime: formattedDateTime },
      };
    }
  }

  return { isValid: true };
}