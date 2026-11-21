import type { SecretDefinition } from './constants';

export function normalizeCustomSecretName(value: string) {
  return value
    .trim()
    .replace(/[-\s]+/g, '_')
    .toUpperCase();
}

export function getSecretNameOptions({
  availableSecrets,
  currentName,
  existingSecrets,
  selectedName,
}: {
  availableSecrets: SecretDefinition[];
  currentName?: string;
  existingSecrets: string[];
  selectedName?: string;
}) {
  const knownOptions = availableSecrets
    .filter(
      (secret) =>
        !existingSecrets.includes(secret.name) || currentName === secret.name
    )
    .map((secret) => ({
      value: secret.name,
      label: secret.name,
    }));

  const selectedNameIsAvailable =
    selectedName &&
    (!existingSecrets.includes(selectedName) || currentName === selectedName);

  if (
    selectedNameIsAvailable &&
    !knownOptions.some((option) => option.value === selectedName)
  ) {
    return [{ value: selectedName, label: selectedName }, ...knownOptions];
  }

  return knownOptions;
}
