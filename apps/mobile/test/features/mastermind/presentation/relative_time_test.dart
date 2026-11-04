import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:mobile/features/mastermind/presentation/relative_time.dart';
import 'package:mobile/l10n/l10n.dart';

void main() {
  // 09:26 on 29 Oct in GMT+7.
  final now = DateTime.utc(2026, 10, 29, 2, 26);
  late AppLocalizations en;
  late AppLocalizations vi;

  setUpAll(() async {
    await initializeDateFormatting('vi');
    en = await AppLocalizations.delegate.load(const Locale('en'));
    vi = await AppLocalizations.delegate.load(const Locale('vi'));
  });

  String text(AppLocalizations l10n, Duration age, {String? zone}) =>
      mastermindRelativeTimeText(
        l10n,
        now.subtract(age),
        now: now,
        zone: zone ?? mastermindDefaultTimeZone,
        locale: l10n.localeName,
      );

  group('mastermindRelativeTime', () {
    test('buckets seconds, minutes, hours, days, then a date', () {
      MastermindRelativeTime at(Duration age) =>
          mastermindRelativeTime(now.subtract(age), now);
      expect(at(Duration.zero), isA<RelativeNow>());
      expect(at(const Duration(seconds: 44)), isA<RelativeNow>());
      expect(
        at(const Duration(seconds: 45)),
        isA<RelativeMinutes>().having((r) => r.count, 'count', 1),
      );
      expect(
        at(const Duration(minutes: 59, seconds: 59)),
        isA<RelativeMinutes>().having((r) => r.count, 'count', 59),
      );
      expect(
        at(const Duration(hours: 1)),
        isA<RelativeHours>().having((r) => r.count, 'count', 1),
      );
      expect(
        at(const Duration(hours: 23, minutes: 59)),
        isA<RelativeHours>().having((r) => r.count, 'count', 23),
      );
      expect(
        at(const Duration(days: 1)),
        isA<RelativeDays>().having((r) => r.count, 'count', 1),
      );
      expect(
        at(const Duration(days: 6, hours: 23)),
        isA<RelativeDays>().having((r) => r.count, 'count', 6),
      );
      expect(at(const Duration(days: 7)), isA<RelativeDate>());
    });

    test('a future instant (clock skew) reads as now', () {
      expect(
        mastermindRelativeTime(now.add(const Duration(minutes: 10)), now),
        isA<RelativeNow>(),
      );
    });

    test('compares instants, not wall clocks', () {
      final local = now.subtract(const Duration(minutes: 5)).toLocal();
      expect(
        mastermindRelativeTime(local, now),
        isA<RelativeMinutes>().having((r) => r.count, 'count', 5),
      );
    });
  });

  group('mastermindRelativeTimeText', () {
    test('en: now, 5m, 2h, 3d, then a short date', () {
      expect(text(en, const Duration(seconds: 10)), 'now');
      expect(text(en, const Duration(minutes: 5)), '5m');
      expect(text(en, const Duration(hours: 2)), '2h');
      expect(text(en, const Duration(days: 3)), '3d');
      expect(text(en, const Duration(days: 9)), '20 Oct');
    });

    test('vi: compact units and the Vietnamese short date', () {
      expect(text(vi, const Duration(seconds: 10)), 'vừa xong');
      expect(text(vi, const Duration(minutes: 5)), '5 phút');
      expect(text(vi, const Duration(hours: 2)), '2 giờ');
      expect(text(vi, const Duration(days: 3)), '3 ngày');
      expect(text(vi, const Duration(days: 9)), '20 thg 10');
    });

    test('a date in another year names the year', () {
      expect(text(en, const Duration(days: 400)), '24 Sep 2025');
    });

    test("the short date is the zone's day, not UTC's", () {
      // 23:30 UTC on 19 Oct is 06:30 on 20 Oct in GMT+7.
      final late = DateTime.utc(2026, 10, 19, 23, 30);
      expect(
        mastermindRelativeTimeText(
          en,
          late,
          now: now,
          zone: mastermindDefaultTimeZone,
          locale: 'en',
        ),
        '20 Oct',
      );
    });
  });

  group('mastermindAbsoluteTimeText', () {
    final at = DateTime.utc(2026, 10, 29, 2, 21);

    test('converts UTC to GMT+7 wall time with the offset', () {
      expect(
        mastermindAbsoluteTimeText(
          at,
          now: now,
          zone: 'Asia/Ho_Chi_Minh',
          locale: 'en',
        ),
        '29 Oct, 09:21 GMT+7',
      );
      expect(
        mastermindAbsoluteTimeText(
          at,
          now: now,
          zone: 'Asia/Ho_Chi_Minh',
          locale: 'vi',
        ),
        '29 thg 10, 09:21 GMT+7',
      );
    });

    test('takes the offset at the instant, so DST zones stay right', () {
      expect(
        mastermindAbsoluteTimeText(
          DateTime.utc(2026, 1, 15, 9, 21),
          now: now,
          zone: 'Europe/London',
          locale: 'en',
        ),
        '15 Jan, 09:21 GMT',
      );
      expect(
        mastermindAbsoluteTimeText(
          DateTime.utc(2026, 7, 15, 8, 21),
          now: now,
          zone: 'Europe/London',
          locale: 'en',
        ),
        '15 Jul, 09:21 GMT+1',
      );
    });

    test('an unknown, empty or auto zone falls back to GMT+7', () {
      for (final zone in ['', 'auto', 'Mars/Olympus_Mons']) {
        expect(mastermindResolvedTimeZone(zone), mastermindDefaultTimeZone);
        expect(
          mastermindAbsoluteTimeText(at, now: now, zone: zone, locale: 'en'),
          '29 Oct, 09:21 GMT+7',
        );
      }
      expect(mastermindResolvedTimeZone('UTC'), 'UTC');
    });

    test('a different year is spelled out', () {
      expect(
        mastermindAbsoluteTimeText(
          DateTime.utc(2025, 10, 29, 2, 21),
          now: now,
          zone: 'Asia/Ho_Chi_Minh',
          locale: 'en',
        ),
        '29 Oct 2025, 09:21 GMT+7',
      );
    });
  });

  group('mastermindSpokenTime', () {
    String spoken(AppLocalizations l10n, DateTime at) => mastermindSpokenTime(
      l10n,
      at,
      now: now,
      zone: 'Asia/Ho_Chi_Minh',
      locale: l10n.localeName,
    );

    test('reads the age then the absolute time', () {
      expect(
        spoken(en, now.subtract(const Duration(minutes: 5))),
        '5 minutes ago, 29 October 09:21 GMT+7',
      );
      expect(
        spoken(en, now.subtract(const Duration(minutes: 1))),
        '1 minute ago, 29 October 09:25 GMT+7',
      );
      expect(
        spoken(en, now.subtract(const Duration(hours: 1))),
        '1 hour ago, 29 October 08:26 GMT+7',
      );
      expect(
        spoken(en, now.subtract(const Duration(days: 2))),
        '2 days ago, 27 October 09:26 GMT+7',
      );
      expect(spoken(en, now), 'just now, 29 October 09:26 GMT+7');
    });

    test('a date-old value is the absolute time alone', () {
      expect(
        spoken(en, now.subtract(const Duration(days: 9))),
        '20 October 09:26 GMT+7',
      );
      expect(
        spoken(en, now.subtract(const Duration(days: 400))),
        '24 September 2025 09:26 GMT+7',
      );
    });

    test('vi', () {
      expect(
        spoken(vi, now.subtract(const Duration(minutes: 5))),
        '5 phút trước, 29 tháng 10 09:21 GMT+7',
      );
    });
  });
}
