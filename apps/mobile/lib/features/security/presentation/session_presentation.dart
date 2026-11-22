/// Pure presentation rules for the security screens: user-agent parsing, IP
/// masking, last-active buckets, session grouping and authenticator device
/// kinds. Nothing here builds widgets or reads the network or the clock;
/// callers pass `now` so every rule is deterministic under test.
library;

import 'package:flutter/foundation.dart' show immutable;

/// The shape of device a session or authenticator runs on.
enum SecurityDeviceKind { phone, tablet, desktop, unknown }

/// The operating system a session reports. [iOS] is only used for this
/// device's own Tuturuuu app session, where the app knows its platform but
/// not whether it is a phone or a tablet.
enum SessionPlatform {
  iPhone,
  iPad,
  iOS,
  android,
  macOS,
  windows,
  linux,
  chromeOS,
  unknown;

  /// Product names are proper nouns and stay untranslated.
  String? get displayName => switch (this) {
    SessionPlatform.iPhone => 'iPhone',
    SessionPlatform.iPad => 'iPad',
    SessionPlatform.iOS => 'iOS',
    SessionPlatform.android => 'Android',
    SessionPlatform.macOS => 'macOS',
    SessionPlatform.windows => 'Windows',
    SessionPlatform.linux => 'Linux',
    SessionPlatform.chromeOS => 'ChromeOS',
    SessionPlatform.unknown => null,
  };
}

enum SessionClientKind {
  /// A web browser ("Chrome", "Safari").
  browser,

  /// The Tuturuuu Flutter app. Its HTTP client reports only `Dart/x (dart:io)`.
  tuturuuuApp,

  /// A desktop app built on a browser engine ("T3 Code").
  desktopApp,

  /// A command-line or library client ("curl", "Tuturuuu CLI").
  tool,
  unknown,
}

/// What a raw user-agent string says about the signed-in client.
@immutable
class SessionClientInfo {
  const SessionClientInfo({
    required this.kind,
    required this.platform,
    required this.device,
    this.name,
  });

  static const unknown = SessionClientInfo(
    kind: SessionClientKind.unknown,
    platform: SessionPlatform.unknown,
    device: SecurityDeviceKind.unknown,
  );

  final SessionClientKind kind;

  /// A fixed browser, app or tool name, never text copied from the user
  /// agent. Null for the Tuturuuu app, unnamed desktop apps and unknown
  /// clients.
  final String? name;
  final SessionPlatform platform;
  final SecurityDeviceKind device;

  @override
  bool operator ==(Object other) =>
      other is SessionClientInfo &&
      other.kind == kind &&
      other.name == name &&
      other.platform == platform &&
      other.device == device;

  @override
  int get hashCode => Object.hash(kind, name, platform, device);

  @override
  String toString() => 'SessionClientInfo($kind, $name, $platform, $device)';
}

const _lostUserAgents = {'', 'unknown', 'node', 'unknown device'};

final _t3Code = RegExp(r'\bT3Code(?:Nightly|Beta|Dev)?/', caseSensitive: false);

/// Parses a stored session user agent into a friendly client description.
///
/// Mirrors the web parser (`apps/web/src/lib/sessions/session-user-agent.ts`)
/// for browsers and adds the app clients the web parser does not know.
SessionClientInfo describeSessionUserAgent(String? userAgent) {
  final value = userAgent?.trim() ?? '';
  if (_lostUserAgents.contains(value.toLowerCase())) {
    return SessionClientInfo.unknown;
  }
  final platform = _platformOf(value);
  final device = _deviceOf(value, platform);

  if (value.startsWith('Dart/') || value.contains('(dart:io)')) {
    return const SessionClientInfo(
      kind: SessionClientKind.tuturuuuApp,
      platform: SessionPlatform.unknown,
      device: SecurityDeviceKind.phone,
    );
  }
  if (RegExp('^Tuturuuu(?:-mobile)?/', caseSensitive: false).hasMatch(value)) {
    return SessionClientInfo(
      kind: SessionClientKind.tuturuuuApp,
      platform: platform,
      device: device == SecurityDeviceKind.unknown
          ? SecurityDeviceKind.phone
          : device,
    );
  }
  if (_t3Code.hasMatch(value)) {
    return SessionClientInfo(
      kind: SessionClientKind.desktopApp,
      name: 'T3 Code',
      platform: platform,
      device: SecurityDeviceKind.desktop,
    );
  }
  if (value.contains('Electron/')) {
    // Other desktop apps stay unnamed: a product token is free text, and a
    // row must not repeat whatever a client put in its user agent.
    return SessionClientInfo(
      kind: SessionClientKind.desktopApp,
      platform: platform,
      device: SecurityDeviceKind.desktop,
    );
  }
  final tool = _toolName(value);
  if (tool != null) {
    return SessionClientInfo(
      kind: SessionClientKind.tool,
      name: tool,
      platform: platform,
      device: SecurityDeviceKind.desktop,
    );
  }
  final browser = _browserName(value);
  if (browser == null && platform == SessionPlatform.unknown) {
    return SessionClientInfo.unknown;
  }
  return SessionClientInfo(
    kind: browser == null
        ? SessionClientKind.unknown
        : SessionClientKind.browser,
    name: browser,
    platform: platform,
    device: device,
  );
}

SessionPlatform _platformOf(String ua) {
  if (ua.contains('iPad')) return SessionPlatform.iPad;
  if (ua.contains('iPhone') || ua.contains('iPod')) {
    return SessionPlatform.iPhone;
  }
  if (ua.contains('Android')) return SessionPlatform.android;
  if (ua.contains('CrOS')) return SessionPlatform.chromeOS;
  if (ua.contains('Windows')) return SessionPlatform.windows;
  if (ua.contains('Macintosh') || ua.contains('Mac OS X')) {
    return SessionPlatform.macOS;
  }
  if (ua.contains('Linux')) return SessionPlatform.linux;
  return SessionPlatform.unknown;
}

SecurityDeviceKind _deviceOf(String ua, SessionPlatform platform) {
  if (platform == SessionPlatform.iPad ||
      RegExp(r'\bTablet\b', caseSensitive: false).hasMatch(ua)) {
    return SecurityDeviceKind.tablet;
  }
  if (platform == SessionPlatform.android) {
    return ua.contains('Mobile')
        ? SecurityDeviceKind.phone
        : SecurityDeviceKind.tablet;
  }
  if (platform == SessionPlatform.iPhone || ua.contains('Mobile')) {
    return SecurityDeviceKind.phone;
  }
  if (platform == SessionPlatform.unknown) return SecurityDeviceKind.unknown;
  return SecurityDeviceKind.desktop;
}

String? _browserName(String ua) {
  if (RegExp('Edg(?:e|A|iOS)?/').hasMatch(ua)) return 'Edge';
  if (ua.contains('OPR/') || ua.contains('Opera')) return 'Opera';
  if (ua.contains('SamsungBrowser/')) return 'Samsung Internet';
  if (ua.contains('FxiOS/') || ua.contains('Firefox/')) return 'Firefox';
  if (ua.contains('CriOS/') || ua.contains('Chrome/')) return 'Chrome';
  if (ua.contains('Safari/')) return 'Safari';
  return null;
}

String? _toolName(String ua) {
  final lower = ua.toLowerCase();
  if (lower.startsWith('ttr/') || lower.startsWith('tuturuuu-cli/')) {
    return 'Tuturuuu CLI';
  }
  if (lower.startsWith('curl/')) return 'curl';
  if (lower.startsWith('python-requests/') || lower.startsWith('python-')) {
    return 'Python';
  }
  if (lower.startsWith('go-http-client/')) return 'Go';
  if (lower.startsWith('node-fetch/') || lower.startsWith('undici')) {
    return 'Node.js';
  }
  if (lower.startsWith('okhttp/')) return 'OkHttp';
  return null;
}

/// The address without a CIDR suffix ("1.2.3.4/32" → "1.2.3.4"). Null when
/// there is none, including the database's "Unknown" placeholder.
String? sessionIpAddress(String? raw) {
  final value = raw?.trim() ?? '';
  if (value.isEmpty || value == 'Unknown') return null;
  final address = value.replaceFirst(RegExp(r'/\d{1,3}$'), '');
  return address.isEmpty ? null : address;
}

final _ipv4 = RegExp(r'^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$');
final _ipv6Group = RegExp(r'^[0-9a-fA-F]{1,4}$');

/// The eight groups of an IPv6 address with `::` expanded to zero groups
/// and an embedded IPv4 suffix counted as two groups. Null when [address]
/// is not IPv6. Expanding first keeps host bits out of the network prefix:
/// `2001::beef` starts with `2001:0`, not `2001:beef`.
List<String>? _ipv6Groups(String address) {
  final halves = address.split('::');
  if (halves.length > 2) return null;
  List<String> parts(String half) => half.isEmpty ? [] : half.split(':');
  final head = parts(halves.first);
  final tail = halves.length == 2 ? parts(halves.last) : <String>[];
  final last = tail.isNotEmpty ? tail : head;
  if (last.isNotEmpty && last.last.contains('.')) {
    if (!_ipv4.hasMatch(last.last)) return null;
    last
      ..removeLast()
      ..addAll(['0', '0']);
  }
  final missing = 8 - head.length - tail.length;
  if (halves.length == 2 ? missing < 1 : missing != 0) return null;
  final groups = [...head, for (var i = 0; i < missing; i++) '0', ...tail];
  return groups.every(_ipv6Group.hasMatch) ? groups : null;
}

/// A shortened address for lists: the first two IPv4 octets or IPv6 groups.
/// IPv4-mapped IPv6 addresses are shown as IPv4. Never includes a prefix
/// length; unrecognised values are hidden rather than shown raw.
String? maskSessionIp(String? raw) {
  var address = sessionIpAddress(raw)?.split('%').first;
  if (address == null || address.isEmpty) return null;
  final mapped = RegExp(
    r'^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$',
    caseSensitive: false,
  ).firstMatch(address);
  if (mapped != null) address = mapped.group(1)!;
  if (_ipv4.firstMatch(address) case final match?) {
    return '${match.group(1)}.${match.group(2)}.x.x';
  }
  if (!address.contains(':')) return null;
  final groups = _ipv6Groups(address);
  if (groups == null) return null;
  final prefix = groups
      .take(2)
      .map((group) => int.parse(group, radix: 16).toRadixString(16));
  return '${prefix.join(':')}:…';
}

enum LastActiveUnit { now, minutes, hours, yesterday, days, weeks, date }

/// How long ago a session was last active, in the coarsest readable unit.
@immutable
class LastActiveBucket {
  const LastActiveBucket(this.unit, [this.count = 0]);

  final LastActiveUnit unit;
  final int count;

  @override
  bool operator ==(Object other) =>
      other is LastActiveBucket && other.unit == unit && other.count == count;

  @override
  int get hashCode => Object.hash(unit, count);

  @override
  String toString() => 'LastActiveBucket($unit, $count)';
}

/// Sessions active within two minutes read as "Active now". Future times
/// (clock skew) do too. After five weeks the caller shows a date.
LastActiveBucket lastActiveBucket(DateTime at, DateTime now) {
  final age = now.difference(at);
  if (age.inMinutes < 2) return const LastActiveBucket(LastActiveUnit.now);
  if (age.inMinutes < 60) {
    return LastActiveBucket(LastActiveUnit.minutes, age.inMinutes);
  }
  if (age.inHours < 24) {
    return LastActiveBucket(LastActiveUnit.hours, age.inHours);
  }
  if (age.inDays < 2) return const LastActiveBucket(LastActiveUnit.yesterday);
  if (age.inDays < 7) return LastActiveBucket(LastActiveUnit.days, age.inDays);
  if (age.inDays < 35) {
    return LastActiveBucket(LastActiveUnit.weeks, age.inDays ~/ 7);
  }
  return const LastActiveBucket(LastActiveUnit.date);
}

/// Sessions split for display: this device, recently active, and older.
class SessionGroups<T> {
  const SessionGroups({
    required this.current,
    required this.recent,
    required this.older,
  });

  final T? current;
  final List<T> recent;
  final List<T> older;

  List<T> get others => [...recent, ...older];
}

/// Groups sessions newest first. The first current session is "This device";
/// another session counts as recent when it was active within [recentWindow].
/// Sessions without a last-active time sort last, among the older ones.
SessionGroups<T> groupSessions<T>(
  Iterable<T> sessions, {
  required bool Function(T) isCurrent,
  required DateTime? Function(T) lastActive,
  required DateTime now,
  Duration recentWindow = const Duration(days: 7),
}) {
  T? current;
  final others = <T>[];
  for (final session in sessions) {
    if (current == null && isCurrent(session)) {
      current = session;
    } else {
      others.add(session);
    }
  }
  others.sort((a, b) {
    final left = lastActive(a);
    final right = lastActive(b);
    if (left == null && right == null) return 0;
    if (left == null) return 1;
    if (right == null) return -1;
    return right.compareTo(left);
  });
  final recent = <T>[];
  final older = <T>[];
  for (final session in others) {
    final at = lastActive(session);
    if (at != null && now.difference(at) <= recentWindow) {
      recent.add(session);
    } else {
      older.add(session);
    }
  }
  return SessionGroups(current: current, recent: recent, older: older);
}

final _tabletName = RegExp(r'\b(ipad|tablet|tab)\b', caseSensitive: false);
final _phoneName = RegExp(
  r'\b(iphone|phone|mobile|android|pixel|galaxy|redmi|xiaomi|oppo|vivo|'
  r'oneplus|huawei|nokia|realme|zenfone)\b',
  caseSensitive: false,
);
final _desktopName = RegExp(
  r'\b(mac|macbook|imac|mini|studio|laptop|desktop|pc|windows|linux|'
  r'thinkpad|surface|chromebook|workstation)\b|book\b',
  caseSensitive: false,
);

/// Guesses the device behind a trusted authenticator from its chosen name
/// ("Skora iPhone 13" → phone). Names are free text, so unmatched names stay
/// [SecurityDeviceKind.unknown] and get a neutral key icon.
SecurityDeviceKind authenticatorDeviceKind(String name) {
  if (_tabletName.hasMatch(name)) return SecurityDeviceKind.tablet;
  if (_phoneName.hasMatch(name)) return SecurityDeviceKind.phone;
  if (_desktopName.hasMatch(name)) return SecurityDeviceKind.desktop;
  return SecurityDeviceKind.unknown;
}

/// Input for [disambiguateSessionIdentifiers].
@immutable
class SessionIdentityPart {
  const SessionIdentityPart({
    required this.id,
    required this.label,
    required this.context,
  });

  final String id;
  final String label;
  final String? context;
}

/// Disambiguation metadata when multiple sessions share a base client label.
@immutable
class SessionDisambiguation {
  const SessionDisambiguation({
    required this.duplicated,
    this.context,
    this.ordinal,
  });

  final bool duplicated;
  final String? context;
  final int? ordinal;

  @override
  bool operator ==(Object other) =>
      other is SessionDisambiguation &&
      other.duplicated == duplicated &&
      other.context == context &&
      other.ordinal == ordinal;

  @override
  int get hashCode => Object.hash(duplicated, context, ordinal);

  @override
  String toString() => 'SessionDisambiguation($duplicated, $context, $ordinal)';
}

/// Marks duplicate client labels so screen-reader controls and confirmation
/// dialogs distinguish sessions using visible row context, with an ordinal
/// fallback when two sessions share both label and context.
Map<String, SessionDisambiguation> disambiguateSessionIdentifiers(
  Iterable<SessionIdentityPart> items,
) {
  final list = items.toList(growable: false);
  final labelCounts = <String, int>{};
  final pairCounts = <String, int>{};
  for (final item in list) {
    labelCounts[item.label] = (labelCounts[item.label] ?? 0) + 1;
    final key = '${item.label}\u0000${item.context ?? ''}';
    pairCounts[key] = (pairCounts[key] ?? 0) + 1;
  }
  final pairSeen = <String, int>{};
  final result = <String, SessionDisambiguation>{};
  for (final item in list) {
    if ((labelCounts[item.label] ?? 0) <= 1) {
      result[item.id] = const SessionDisambiguation(duplicated: false);
      continue;
    }
    final key = '${item.label}\u0000${item.context ?? ''}';
    final hasTie = (pairCounts[key] ?? 0) > 1;
    final ordinal = hasTie ? (pairSeen[key] ?? 0) + 1 : null;
    if (ordinal != null) pairSeen[key] = ordinal;
    result[item.id] = SessionDisambiguation(
      duplicated: true,
      context: item.context,
      ordinal: ordinal,
    );
  }
  return result;
}
