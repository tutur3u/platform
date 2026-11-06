import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:mobile/features/mastermind/model/enums.dart';
import 'package:mobile/features/mastermind/presentation/gmt7.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
import 'package:mobile/features/mastermind/presentation/snapshot_age.dart';
import 'package:mobile/l10n/gen/app_localizations_en.dart';
import 'package:mobile/l10n/gen/app_localizations_vi.dart';

void main() {
  final generated = DateTime.utc(2026);
  for (final entry in {
    -1: SnapshotAge.fresh,
    0: SnapshotAge.fresh,
    300: SnapshotAge.fresh,
    301: SnapshotAge.aging,
    900: SnapshotAge.aging,
    901: SnapshotAge.stale,
  }.entries) {
    test('snapshot age at ${entry.key} seconds', () {
      expect(
        SnapshotAge.from(
          generated,
          clock: () => generated.add(Duration(seconds: entry.key)),
        ),
        entry.value,
      );
    });
  }
  setUpAll(() async {
    await initializeDateFormatting('en');
    await initializeDateFormatting('vi');
  });
  for (final locale in ['en', 'vi']) {
    test('GMT+7 midnight and month boundary ($locale)', () {
      final before = DateTime.utc(2026, 1, 31, 16, 59);
      final after = before.add(const Duration(minutes: 1));
      expect(Gmt7.time(before, locale), '23:59');
      expect(Gmt7.time(after, locale), '00:00');
      expect(Gmt7.wallTime(after), DateTime.utc(2026, 2));
      expect(Gmt7.date(before, locale), isNot(Gmt7.date(after, locale)));
      expect(Gmt7.day(after, locale), isNot(Gmt7.day(before, locale)));
      expect(Gmt7.dateTime(after, locale), contains('GMT+7'));
      expect(Gmt7.dateTime(after, locale), contains('2026'));
    });
  }
  test('localized states and verbatim public labels', () {
    final en = AppLocalizationsEn();
    final vi = AppLocalizationsVi();
    expect(MastermindLabels.laneState(en, LaneState.running), 'running');
    expect(MastermindLabels.laneState(vi, LaneState.running), 'đang chạy');
    expect(MastermindLabels.coverage(vi, Coverage.partial), 'Dữ liệu một phần');
    expect(MastermindLabels.modelFamily(ModelFamily.opus), 'Opus');
    expect(MastermindLabels.pacing(Pacing.short), 'SHORT');
  });
}
