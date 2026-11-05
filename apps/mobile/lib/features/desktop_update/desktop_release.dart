const desktopReleaseRepository = 'tutur3u/platform';

/// Current tags are `desktop-v<version>`; legacy betas appended the CI run ID.
final desktopReleaseTag = RegExp(r'^desktop-v(\d+\.\d+\.\d+)(?:-(\d+))?$');

const desktopAssets = {
  'windows': 'Tuturuuu-windows-x64-setup.exe',
  'macos': 'Tuturuuu-macos-universal.dmg',
  'linux': 'Tuturuuu-linux-x64.deb',
};

/// Public release metadata is untrusted until the repository, tag, complete
/// asset set, exact URLs, lengths and GitHub digests have all been checked.
class DesktopRelease {
  const DesktopRelease({
    required this.tag,
    required this.version,
    required this.run,
    required this.name,
    required this.url,
    required this.size,
    required this.digest,
  });

  final String tag;
  final String version;

  /// Legacy run-suffixed tags only; current releases differ by version.
  final BigInt? run;
  final String name;
  final Uri url;
  final int size;
  final String digest;

  /// Parses `major.minor.patch`; anything else is unknown (`null`).
  static List<int>? parseVersion(String value) {
    final parts = value.split('.').map(int.tryParse).toList();
    if (parts.length != 3 || parts.contains(null)) return null;
    return parts.cast<int>();
  }

  /// Orders releases by version, then by legacy run. An unknown version or a
  /// missing run sorts lowest so it can never outrank a known release.
  int compareTo(DesktopRelease other) {
    final a = parseVersion(version);
    final b = parseVersion(other.version);
    if (a == null || b == null) {
      if (a != null) return 1;
      if (b != null) return -1;
    } else {
      for (var i = 0; i < 3; i++) {
        if (a[i] != b[i]) return a[i].compareTo(b[i]);
      }
    }
    final left = run;
    final right = other.run;
    if (left == null || right == null) {
      if (left != null) return 1;
      if (right != null) return -1;
      return 0;
    }
    return left.compareTo(right);
  }

  bool newerThan(String installedVersion, String installedRun) {
    final current = parseVersion(installedVersion);
    final next = parseVersion(version);
    if (current == null || next == null) return false;
    for (var i = 0; i < 3; i++) {
      if (next[i] != current[i]) return next[i] > current[i];
    }
    final previousRun = BigInt.tryParse(installedRun);
    final run = this.run;
    return run != null && previousRun != null && run > previousRun;
  }

  static DesktopRelease? parse(Object? value, String platform) {
    if (value is! Map<String, dynamic> ||
        value['draft'] != false ||
        value['prerelease'] != true) {
      return null;
    }
    final tag = value['tag_name'];
    if (tag is! String || tag.length > 100) return null;
    final match = desktopReleaseTag.firstMatch(tag);
    if (match == null) return null;
    const base = 'https://github.com/$desktopReleaseRepository/releases';
    if (value['html_url'] != '$base/tag/$tag') return null;
    final assets = value['assets'];
    if (assets is! List<dynamic>) return null;
    DesktopRelease? selected;
    var verifiedAssets = 0;
    for (final entry in desktopAssets.entries) {
      final matches = assets
          .whereType<Map<String, dynamic>>()
          .where((item) => item['name'] == entry.value)
          .toList();
      if (matches.isEmpty) continue;
      if (matches.length != 1) return null;
      verifiedAssets++;
      final asset = matches.single;
      final size = asset['size'];
      final digest = asset['digest'];
      final url = '$base/download/$tag/${entry.value}';
      if (asset['state'] != 'uploaded' ||
          asset['browser_download_url'] != url ||
          size is! int ||
          size <= 0 ||
          size > 2 * 1024 * 1024 * 1024 ||
          digest is! String ||
          !RegExp(r'^sha256:[a-f0-9]{64}$').hasMatch(digest)) {
        return null;
      }
      if (entry.key == platform) {
        selected = DesktopRelease(
          tag: tag,
          version: match[1]!,
          run: match[2] == null ? null : BigInt.parse(match[2]!),
          name: entry.value,
          url: Uri.parse(url),
          size: size,
          digest: digest.substring(7),
        );
      }
    }
    return verifiedAssets == assets.length ? selected : null;
  }
}
