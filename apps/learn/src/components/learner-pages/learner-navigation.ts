export function withLearnerStudent(path: string, studentId: string | null) {
  if (!studentId) return path;
  const hashStart = path.indexOf('#');
  const destination = hashStart === -1 ? path : path.slice(0, hashStart);
  const hash = hashStart === -1 ? '' : path.slice(hashStart);
  const queryStart = destination.indexOf('?');
  const pathname =
    queryStart === -1 ? destination : destination.slice(0, queryStart);
  const params = new URLSearchParams(
    queryStart === -1 ? '' : destination.slice(queryStart + 1)
  );
  params.set('studentId', studentId);
  return `${pathname}?${params}${hash}`;
}
