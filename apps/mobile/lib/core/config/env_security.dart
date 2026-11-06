/// Thrown at startup when a release build would talk to a backend over
/// anything other than https.
class InsecureEnvException implements Exception {
  const InsecureEnvException(this.problems);

  final List<String> problems;

  @override
  String toString() =>
      'InsecureEnvException: release builds require https backend URLs '
      '(${problems.join('; ')}). Pass them with --dart-define.';
}

bool isHttpsUrl(String value) {
  final uri = Uri.tryParse(value);
  return uri != null && uri.scheme == 'https' && uri.host.isNotEmpty;
}

/// Returns one message per backend URL that is not safe to ship.
///
/// [requiredUrls] must be set and https. [optionalUrls] may be empty (the
/// flavor's https default applies) but must be https when provided.
List<String> findInsecureBackendUrls({
  required Map<String, String> requiredUrls,
  Map<String, String> optionalUrls = const {},
}) => [
  for (final MapEntry(:key, :value) in requiredUrls.entries)
    if (value.isEmpty)
      '$key is missing'
    else if (!isHttpsUrl(value))
      '$key is not https',
  for (final MapEntry(:key, :value) in optionalUrls.entries)
    if (value.isNotEmpty && !isHttpsUrl(value)) '$key is not https',
];

/// Fails closed in release builds; debug and profile may keep localhost http.
void assertSecureBackendUrls({
  required bool releaseMode,
  required Map<String, String> requiredUrls,
  Map<String, String> optionalUrls = const {},
}) {
  if (!releaseMode) return;
  final problems = findInsecureBackendUrls(
    requiredUrls: requiredUrls,
    optionalUrls: optionalUrls,
  );
  if (problems.isNotEmpty) throw InsecureEnvException(problems);
}
