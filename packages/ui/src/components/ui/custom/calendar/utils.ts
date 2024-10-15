export interface WorkspaceUserAttendance {
  date: string;
  status: 'PRESENT' | 'ABSENT';
  groups?: {
    id: string;
    name: string;
  }[];
}

export const isCurrentMonth = (date: Date, currentDate: Date) =>
  date.getMonth() === currentDate.getMonth() &&
  date.getFullYear() === currentDate.getFullYear();

export const isDateAttended = (
  date: Date,
  attendanceData?: WorkspaceUserAttendance[]
) =>
  attendanceData
    ? attendanceData.some((attendance) => {
        const attendanceDate = new Date(attendance.date);
        return (
          attendanceDate.getDate() === date.getDate() &&
          attendanceDate.getMonth() === date.getMonth() &&
          attendanceDate.getFullYear() === date.getFullYear() &&
          attendance.status === 'PRESENT'
        );
      })
    : false;

export const isDateAbsent = (
  date: Date,
  attendanceData?: WorkspaceUserAttendance[]
) =>
  attendanceData
    ? attendanceData.some((attendance) => {
        const attendanceDate = new Date(attendance.date);
        return (
          attendanceDate.getDate() === date.getDate() &&
          attendanceDate.getMonth() === date.getMonth() &&
          attendanceDate.getFullYear() === date.getFullYear() &&
          attendance.status === 'ABSENT'
        );
      })
    : false;

export const getAttendanceGroupNames = (
  date: Date,
  attendanceData?: WorkspaceUserAttendance[]
): string[] => {
  if (!attendanceData) return [];
  const filteredAttendance = attendanceData.filter((attendance) => {
    const attendanceDate = new Date(attendance.date);
    return (
      attendanceDate.getDate() === date.getDate() &&
      attendanceDate.getMonth() === date.getMonth() &&
      attendanceDate.getFullYear() === date.getFullYear()
    );
  });

  const uniqueGroups = filteredAttendance.reduce(
    (acc, curr) => {
      Array.isArray(curr.groups)
        ? curr.groups.forEach((group) => {
            if (!acc.some((g) => g.id === group.id)) {
              acc.push(group);
            }
          })
        : curr.groups && acc.push(curr.groups);

      return acc;
    },
    [] as { id: string; name: string }[]
  );

  return uniqueGroups.map((group) => group.name);
};
