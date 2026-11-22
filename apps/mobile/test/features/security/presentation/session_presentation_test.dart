import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/security/presentation/session_presentation.dart';

void main() {
  group('describeSessionUserAgent', () {
    SessionClientInfo info(
      SessionClientKind kind,
      SessionPlatform platform,
      SecurityDeviceKind device, [
      String? name,
    ]) => SessionClientInfo(
      kind: kind,
      name: name,
      platform: platform,
      device: device,
    );

    final cases = <String, SessionClientInfo>{
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
          '(KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36': info(
        SessionClientKind.browser,
        SessionPlatform.macOS,
        SecurityDeviceKind.desktop,
        'Chrome',
      ),
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) '
          'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 '
          'Mobile/15E148 Safari/604.1': info(
        SessionClientKind.browser,
        SessionPlatform.iPhone,
        SecurityDeviceKind.phone,
        'Safari',
      ),
      'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 '
          '(KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1': info(
        SessionClientKind.browser,
        SessionPlatform.iPad,
        SecurityDeviceKind.tablet,
        'Chrome',
      ),
      'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 '
          '(KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36': info(
        SessionClientKind.browser,
        SessionPlatform.android,
        SecurityDeviceKind.phone,
        'Chrome',
      ),
      'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 '
          '(KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 '
          'Safari/537.36': info(
        SessionClientKind.browser,
        SessionPlatform.android,
        SecurityDeviceKind.tablet,
        'Samsung Internet',
      ),
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
          '(KHTML, like Gecko) Chrome/131.0 Safari/537.36 Edg/131.0': info(
        SessionClientKind.browser,
        SessionPlatform.windows,
        SecurityDeviceKind.desktop,
        'Edge',
      ),
      'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 '
          'Firefox/133.0': info(
        SessionClientKind.browser,
        SessionPlatform.linux,
        SecurityDeviceKind.desktop,
        'Firefox',
      ),
      'Dart/3.14 (dart:io)': info(
        SessionClientKind.tuturuuuApp,
        SessionPlatform.unknown,
        SecurityDeviceKind.phone,
      ),
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
          '(KHTML, like Gecko) T3CodeNightly/0.1.12 Chrome/142.0.0.0 '
          'Electron/39.2.1 Safari/537.36': info(
        SessionClientKind.desktopApp,
        SessionPlatform.macOS,
        SecurityDeviceKind.desktop,
        'T3 Code',
      ),
      // A product token is free text, so other desktop apps stay unnamed.
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
          '(KHTML, like Gecko) Workstation-QA-0142/4.41.0 Chrome/130.0 '
          'Electron/33.0 Safari/537.36': info(
        SessionClientKind.desktopApp,
        SessionPlatform.windows,
        SecurityDeviceKind.desktop,
      ),
      'curl/8.7.1': info(
        SessionClientKind.tool,
        SessionPlatform.unknown,
        SecurityDeviceKind.desktop,
        'curl',
      ),
    };

    for (final MapEntry(key: userAgent, value: expected) in cases.entries) {
      test('parses ${expected.name ?? expected.kind.name} '
          'on ${expected.platform.name}', () {
        expect(describeSessionUserAgent(userAgent), expected);
      });
    }

    test('treats lost or placeholder agents as unknown', () {
      for (final value in [
        null,
        '',
        '  ',
        'Unknown',
        'node',
        'Unknown Device',
      ]) {
        expect(describeSessionUserAgent(value), SessionClientInfo.unknown);
      }
    });

    test('keeps an unrecognised client with a known platform', () {
      expect(
        describeSessionUserAgent('SomeKiosk (Windows NT 10.0)'),
        info(
          SessionClientKind.unknown,
          SessionPlatform.windows,
          SecurityDeviceKind.desktop,
        ),
      );
    });

    test('platform names are untranslated product names', () {
      expect(SessionPlatform.iPhone.displayName, 'iPhone');
      expect(SessionPlatform.macOS.displayName, 'macOS');
      expect(SessionPlatform.unknown.displayName, isNull);
    });
  });

  group('IP addresses', () {
    test('drop the CIDR suffix for details', () {
      expect(sessionIpAddress('113.161.2.4/32'), '113.161.2.4');
      expect(sessionIpAddress('2402:800:63b5::1f/128'), '2402:800:63b5::1f');
      expect(sessionIpAddress(' 10.0.0.1 '), '10.0.0.1');
      expect(sessionIpAddress(''), isNull);
      expect(sessionIpAddress(null), isNull);
      // The sessions function reports a missing address as "Unknown".
      expect(sessionIpAddress('Unknown'), isNull);
      expect(maskSessionIp('Unknown'), isNull);
    });

    test('mask list addresses and never show a prefix length', () {
      expect(maskSessionIp('113.161.2.4/32'), '113.161.x.x');
      expect(maskSessionIp('2402:800:63b5:91c2::1f/128'), '2402:800:…');
      expect(maskSessionIp('::ffff:14.161.22.9'), '14.161.x.x');
      expect(maskSessionIp('not-an-address'), isNull);
      expect(maskSessionIp('2402:zz::1'), isNull);
      expect(maskSessionIp(null), isNull);
    });

    test('expand compressed IPv6 so host bits stay hidden', () {
      expect(maskSessionIp('2001::beef/128'), '2001:0:…');
      expect(maskSessionIp('::1/128'), '0:0:…');
      expect(maskSessionIp('2001:0DB8:85a3::8a2e:370:7334'), '2001:db8:…');
      expect(maskSessionIp('fe80::1%en0'), 'fe80:0:…');
      expect(maskSessionIp('64:ff9b::1.2.3.4'), '64:ff9b:…');
      expect(maskSessionIp('1:2:3:4:5:6:7:8'), '1:2:…');
      for (final invalid in [
        ':::',
        '1::2::3',
        '1:2:3:4:5:6:7:8:9',
        '1:2:3',
        '::1.2.3',
      ]) {
        expect(maskSessionIp(invalid), isNull, reason: invalid);
      }
      for (final raw in ['1.2.3.4/32', 'fe80::1/128', '::ffff:1.2.3.4/128']) {
        expect(maskSessionIp(raw), isNot(contains('/')));
      }
    });
  });

  group('lastActiveBucket', () {
    final now = DateTime.utc(2026, 11, 22, 12);
    LastActiveBucket ago(Duration age) =>
        lastActiveBucket(now.subtract(age), now);

    test('uses the coarsest readable unit', () {
      expect(
        ago(const Duration(seconds: 30)),
        const LastActiveBucket(LastActiveUnit.now),
      );
      expect(
        ago(const Duration(minutes: 5)),
        const LastActiveBucket(LastActiveUnit.minutes, 5),
      );
      expect(
        ago(const Duration(hours: 2, minutes: 40)),
        const LastActiveBucket(LastActiveUnit.hours, 2),
      );
      expect(
        ago(const Duration(hours: 30)),
        const LastActiveBucket(LastActiveUnit.yesterday),
      );
      expect(
        ago(const Duration(days: 4)),
        const LastActiveBucket(LastActiveUnit.days, 4),
      );
      expect(
        ago(const Duration(days: 15)),
        const LastActiveBucket(LastActiveUnit.weeks, 2),
      );
      expect(
        ago(const Duration(days: 60)),
        const LastActiveBucket(LastActiveUnit.date),
      );
    });

    test('treats a future timestamp (clock skew) as active now', () {
      expect(
        lastActiveBucket(now.add(const Duration(minutes: 3)), now),
        const LastActiveBucket(LastActiveUnit.now),
      );
    });
  });

  group('groupSessions', () {
    final now = DateTime.utc(2026, 11, 22, 12);
    ({String id, bool current, DateTime? at}) s(
      String id, {
      bool current = false,
      Duration? age,
    }) =>
        (id: id, current: current, at: age == null ? null : now.subtract(age));

    SessionGroups<({String id, bool current, DateTime? at})> group(
      List<({String id, bool current, DateTime? at})> sessions,
    ) => groupSessions(
      sessions,
      isCurrent: (session) => session.current,
      lastActive: (session) => session.at,
      now: now,
    );

    List<String> ids(List<({String id, bool current, DateTime? at})> list) => [
      for (final session in list) session.id,
    ];

    test('puts this device first and splits the rest by recency', () {
      final groups = group([
        s('old', age: const Duration(days: 20)),
        s('recent-late', age: const Duration(days: 3)),
        s('this', current: true, age: const Duration(minutes: 1)),
        s('recent-early', age: const Duration(hours: 2)),
        s('no-time'),
        s('edge', age: const Duration(days: 7)),
      ]);
      expect(groups.current?.id, 'this');
      expect(ids(groups.recent), ['recent-early', 'recent-late', 'edge']);
      expect(ids(groups.older), ['old', 'no-time']);
      expect(ids(groups.others), [
        'recent-early',
        'recent-late',
        'edge',
        'old',
        'no-time',
      ]);
    });

    test('keeps a second current session among the others', () {
      final groups = group([
        s('a', current: true, age: const Duration(hours: 1)),
        s('b', current: true, age: const Duration(hours: 2)),
      ]);
      expect(groups.current?.id, 'a');
      expect(ids(groups.recent), ['b']);
    });

    test('handles no sessions', () {
      final groups = group(const []);
      expect(groups.current, isNull);
      expect(groups.others, isEmpty);
    });
  });

  group('authenticatorDeviceKind', () {
    test('reads the device type from its chosen name', () {
      expect(
        authenticatorDeviceKind('Skora iPhone 13'),
        SecurityDeviceKind.phone,
      );
      expect(authenticatorDeviceKind('iPhone 17'), SecurityDeviceKind.phone);
      expect(
        authenticatorDeviceKind('Tablet S8 Tab'),
        SecurityDeviceKind.tablet,
      );
      expect(
        authenticatorDeviceKind('Galaxy Tab S9'),
        SecurityDeviceKind.tablet,
      );
      expect(authenticatorDeviceKind('iPad Pro'), SecurityDeviceKind.tablet);
      expect(
        authenticatorDeviceKind('Skora Macbook M3 Pro'),
        SecurityDeviceKind.desktop,
      );
      expect(authenticatorDeviceKind('Mac mini'), SecurityDeviceKind.desktop);
      expect(
        authenticatorDeviceKind('Tuturuuu mobile'),
        SecurityDeviceKind.phone,
      );
      expect(authenticatorDeviceKind('Work key'), SecurityDeviceKind.unknown);
    });
  });

  group('disambiguateSessionIdentifiers', () {
    test(
      'adds context for duplicate labels and ordinals for matching context',
      () {
        final result = disambiguateSessionIdentifiers(const [
          SessionIdentityPart(
            id: 'unique',
            label: 'Safari on iPhone',
            context: '171.250.x.x, Yesterday',
          ),
          SessionIdentityPart(
            id: 'chrome-1',
            label: 'Chrome on macOS',
            context: '14.161.x.x, 2 hours ago',
          ),
          SessionIdentityPart(
            id: 'chrome-2',
            label: 'Chrome on macOS',
            context: '14.161.x.x, 2 hours ago',
          ),
          SessionIdentityPart(
            id: 'chrome-3',
            label: 'Chrome on macOS',
            context: '2402:800:…, 5 hours ago',
          ),
          SessionIdentityPart(
            id: 'app-1',
            label: 'Tuturuuu app',
            context: null,
          ),
          SessionIdentityPart(
            id: 'app-2',
            label: 'Tuturuuu app',
            context: null,
          ),
        ]);

        expect(
          result['unique'],
          const SessionDisambiguation(duplicated: false),
        );
        expect(
          result['chrome-1'],
          const SessionDisambiguation(
            duplicated: true,
            context: '14.161.x.x, 2 hours ago',
            ordinal: 1,
          ),
        );
        expect(
          result['chrome-2'],
          const SessionDisambiguation(
            duplicated: true,
            context: '14.161.x.x, 2 hours ago',
            ordinal: 2,
          ),
        );
        expect(
          result['chrome-3'],
          const SessionDisambiguation(
            duplicated: true,
            context: '2402:800:…, 5 hours ago',
          ),
        );
        expect(
          result['app-1'],
          const SessionDisambiguation(duplicated: true, ordinal: 1),
        );
        expect(
          result['app-2'],
          const SessionDisambiguation(duplicated: true, ordinal: 2),
        );
      },
    );
  });
}
