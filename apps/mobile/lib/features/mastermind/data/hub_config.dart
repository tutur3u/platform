/// Where the Mastermind hub Worker lives for this build.
///
/// An explicit `MASTERMIND_HUB_URL` define wins, otherwise the staging flavor
/// picks its hosted Worker. Anything else, production included until the beta
/// rollout, is unconfigured, and the source fails closed rather than guessing a
/// host.
abstract final class MastermindHubConfig {
  static const stagingUrl = 'https://mastermind-hub-staging.tutur3u.com';
  static const _override = String.fromEnvironment('MASTERMIND_HUB_URL');

  static Uri? resolve({String? flavor, String? override}) {
    final explicit = override ?? _override;
    if (explicit.isNotEmpty) return parseBaseUrl(explicit);
    return switch (flavor) {
      'staging' => parseBaseUrl(stagingUrl),
      _ => null,
    };
  }

  /// HTTPS origin only: no credentials, query, fragment or path. The bearer
  /// token must never leave over cleartext or to a lookalike URL shape.
  static Uri? parseBaseUrl(String value) {
    final uri = Uri.tryParse(value.trim());
    if (uri == null ||
        uri.scheme != 'https' ||
        uri.host.isEmpty ||
        uri.userInfo.isNotEmpty ||
        uri.hasQuery ||
        uri.hasFragment ||
        (uri.path.isNotEmpty && uri.path != '/')) {
      return null;
    }
    return Uri(
      scheme: 'https',
      host: uri.host,
      port: uri.hasPort ? uri.port : null,
    );
  }
}
