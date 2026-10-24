function nextPatch(base) {
  if (
    typeof base !== 'string' ||
    !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(base)
  )
    throw new Error('INVALID_DEV_IDENTITY');
  const parts = base.split('.').map(Number);
  if (
    parts.some((part) => !Number.isSafeInteger(part)) ||
    !Number.isSafeInteger(parts[2] + 1)
  )
    throw new Error('INVALID_DEV_IDENTITY');
  return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
}
function devVersion(base, run, sha) {
  if (!/^[1-9][0-9]*$/.test(run) || !/^[a-f0-9]{40}$/.test(sha || ''))
    throw new Error('INVALID_DEV_IDENTITY');
  return `${nextPatch(base)}-dev.${run}.${sha.slice(0, 7)}`;
}
module.exports = { nextPatch, devVersion };
