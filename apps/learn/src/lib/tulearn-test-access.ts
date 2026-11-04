import {
  type Db,
  getAssignedCourseIds,
  type TulearnSubject,
} from '@tuturuuu/education-core/tulearn/service';

export async function canAccessLearnerTestCourse({
  db,
  subject,
  courseId,
}: {
  db: Db;
  subject: TulearnSubject;
  courseId: string;
}) {
  const courseIds = await getAssignedCourseIds({
    db,
    studentWorkspaceUserId: subject.studentWorkspaceUserId,
    wsId: subject.wsId,
  });
  return courseIds.includes(courseId);
}
