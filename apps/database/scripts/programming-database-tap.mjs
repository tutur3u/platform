/** Fail closed on truncated, skipped, TODO, duplicate or failing fixture TAP. */
export function assertStrictTap(tap) {
  const plans = [...tap.matchAll(/^1\.\.(\d+)$/gm)];
  const assertions = tap
    .split(/\r?\n/u)
    .filter((line) => /^(?:not )?ok\b/u.test(line));
  if (
    /^Bail out!/imu.test(tap) ||
    plans.length !== 1 ||
    Number(plans[0][1]) === 0 ||
    assertions.length !== Number(plans[0][1]) ||
    !assertions.every((line, i) =>
      new RegExp(`^ok ${i + 1} - [^#]+$`, 'u').test(line)
    )
  )
    throw new Error('Programming database fixture TAP contract failed');
}
