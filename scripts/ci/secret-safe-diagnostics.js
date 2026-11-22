// Errors from subprocesses and providers can contain credentials in their
// message, arguments, or output. Only emit known codes and numeric statuses.
function safeFailureSuffix(error) {
  const { code, httpStatus, status } = error ?? {};
  if (Number.isInteger(httpStatus) && httpStatus >= 400 && httpStatus <= 599)
    return ` (HTTP ${httpStatus})`;
  if (Number.isInteger(status) && status > 0 && status <= 255)
    return ` (exit ${status})`;
  switch (code) {
    case 'EACCES':
      return ' (EACCES)';
    case 'EEXIST':
      return ' (EEXIST)';
    case 'ENOENT':
      return ' (ENOENT)';
    case 'ETIMEDOUT':
      return ' (ETIMEDOUT)';
    default:
      return '';
  }
}

module.exports = { safeFailureSuffix };
