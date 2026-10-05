const RETRY_INTERVAL_MS = 2_000;

// Registry reads are safe to repeat; dispatch and intent writes are never retried.
async function waitForPackageVisibility({
  packages,
  versionExists,
  deadline,
  now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  for (;;) {
    if (now() >= deadline) {
      throw new Error(
        'Package registry visibility deadline exceeded; no dispatch'
      );
    }
    let visible = true;
    for (const pkg of packages) {
      if (now() >= deadline) {
        throw new Error(
          'Package registry visibility deadline exceeded; no dispatch'
        );
      }
      try {
        if (
          !(await versionExists({
            deadline,
            packageName: pkg.packageJson.name,
            packageVersion: pkg.version,
          }))
        )
          visible = false;
      } catch {
        visible = false;
      }
    }
    if (visible && now() < deadline) return;
    const remaining = deadline - now();
    if (remaining <= 0) {
      throw new Error(
        'Package registry visibility deadline exceeded; no dispatch'
      );
    }
    await sleep(Math.min(RETRY_INTERVAL_MS, remaining));
  }
}

module.exports = { waitForPackageVisibility };
