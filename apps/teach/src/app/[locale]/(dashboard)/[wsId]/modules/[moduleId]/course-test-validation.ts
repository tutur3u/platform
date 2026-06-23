export type CourseTestValidationError =
  | 'invalidDuration'
  | 'invalidStartTime'
  | 'selectModules'
  | 'startTimeInPast'
  | 'testNameRequired';

type CourseTestValidationInput = {
  description: string;
  durationInMinutes: string;
  moduleIds?: string[];
  name: string;
  requireModules?: boolean;
  startAt: string;
};

type CourseTestValidationSuccess = {
  description: string | null;
  durationInMinutes: number | null;
  moduleIds: string[];
  name: string;
  startAt: string | null;
};

export function validateCourseTestForm({
  description,
  durationInMinutes,
  moduleIds = [],
  name,
  requireModules = false,
  startAt,
}: CourseTestValidationInput):
  | { data: CourseTestValidationSuccess; success: true }
  | { error: CourseTestValidationError; success: false } {
  const trimmedName = name.trim();
  if (!trimmedName) {
    return { error: 'testNameRequired', success: false };
  }

  if (requireModules && moduleIds.length === 0) {
    return { error: 'selectModules', success: false };
  }

  let parsedStartAt: string | null = null;
  if (startAt) {
    const parsedDate = new Date(startAt);
    if (Number.isNaN(parsedDate.getTime())) {
      return { error: 'invalidStartTime', success: false };
    }
    if (parsedDate < new Date()) {
      return { error: 'startTimeInPast', success: false };
    }
    parsedStartAt = parsedDate.toISOString();
  }

  let parsedDuration: number | null = null;
  if (durationInMinutes) {
    const trimmedDuration = durationInMinutes.trim();
    if (!/^\d+$/.test(trimmedDuration)) {
      return { error: 'invalidDuration', success: false };
    }

    const durationVal = Number(trimmedDuration);
    if (
      !Number.isSafeInteger(durationVal) ||
      durationVal < 1 ||
      durationVal > 1440
    ) {
      return { error: 'invalidDuration', success: false };
    }
    parsedDuration = durationVal;
  }

  return {
    data: {
      description: description.trim() || null,
      durationInMinutes: parsedDuration,
      moduleIds,
      name: trimmedName,
      startAt: parsedStartAt,
    },
    success: true,
  };
}
