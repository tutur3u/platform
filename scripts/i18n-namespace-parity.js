function resolveKeyPath(json, namespace, key) {
  const segments = [
    ...(namespace ? namespace.split('.') : []),
    ...key.split('.'),
  ];
  let current = json;

  for (const segment of segments) {
    if (current == null || typeof current !== 'object') return false;
    if (!(segment in current)) return false;
    current = current[segment];
  }

  return current !== null && current !== undefined;
}

function collectLeafKeyPaths(value, prefix, out) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    if (prefix) out.add(prefix);
    return;
  }

  for (const key of Object.keys(value)) {
    collectLeafKeyPaths(value[key], prefix ? `${prefix}.${key}` : key, out);
  }
}

function checkNamespaceParity(groups, loadTranslations) {
  const failures = [];

  for (const group of groups) {
    const apps = group.apps.map((appDir) => ({
      appDir,
      json: loadTranslations(appDir),
    }));

    for (const namespace of group.namespaces) {
      const union = new Set();
      for (const { json } of apps) {
        if (json) collectLeafKeyPaths(json[namespace], '', union);
      }

      for (const { appDir, json } of apps) {
        if (!json) {
          failures.push({
            appDir,
            namespace,
            missing: ['(no messages/en.json)'],
          });
          continue;
        }

        const missing = [...union]
          .filter((keyPath) => !resolveKeyPath(json, namespace, keyPath))
          .sort();

        if (missing.length > 0) {
          failures.push({ appDir, namespace, missing });
        }
      }
    }
  }

  return failures;
}

module.exports = {
  checkNamespaceParity,
};
