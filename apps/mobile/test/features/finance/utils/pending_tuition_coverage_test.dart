import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/finance/utils/pending_tuition_coverage.dart';

void main() {
  test('nothing owed selects no month', () {
    expect(pendingTuitionCoverage(const []), (
      month: null,
      count: 1,
      last: null,
    ));
  });

  test('starts at the earliest owed month regardless of order', () {
    expect(pendingTuitionCoverage(const ['2026-11', '2026-09', '2026-10']), (
      month: '2026-09',
      count: 3,
      last: '2026-11',
    ));
  });

  test('crosses a year boundary', () {
    expect(pendingTuitionCoverage(const ['2026-12', '2027-01']), (
      month: '2026-12',
      count: 2,
      last: '2027-01',
    ));
  });

  test('stops at a gap so a separately paid month is never covered twice', () {
    expect(pendingTuitionCoverage(const ['2026-09', '2026-11']), (
      month: '2026-09',
      count: 1,
      last: '2026-09',
    ));
  });

  test('selects only the earliest month for multi-class rows', () {
    expect(
      pendingTuitionCoverage(const ['2026-09', '2026-10'], singleMonth: true),
      (month: '2026-09', count: 1, last: '2026-09'),
    );
  });

  test('ignores duplicates and malformed months', () {
    expect(
      pendingTuitionCoverage(const ['2026-09', '2026-09', 'nope', ' 2026-10 ']),
      (month: '2026-09', count: 2, last: '2026-10'),
    );
  });

  test('caps the range at the prepaid month limit', () {
    final months = [
      for (var i = 0; i < 14; i++)
        '${2025 + i ~/ 12}-${(i % 12 + 1).toString().padLeft(2, '0')}',
    ];
    expect(pendingTuitionCoverage(months), (
      month: '2025-01',
      count: maxPrepaidMonthCount,
      last: '2025-12',
    ));
  });
}
