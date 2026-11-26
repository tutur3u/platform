/// Most months one subscription invoice can cover, matching the API limit.
const maxPrepaidMonthCount = 12;

final _monthPattern = RegExp(r'^(\d{4})-(0[1-9]|1[0-2])$');

/// Default coverage for a pending tuition row: the earliest owed month
/// (`YYYY-MM`, or `null` when nothing is owed) and the unbroken run of owed
/// months after it, capped at [maxPrepaidMonthCount].
typedef PendingTuitionCoverage = ({String? month, int count, String? last});

int? _monthIndex(String value) {
  final match = _monthPattern.firstMatch(value.trim());
  if (match == null) return null;
  return int.parse(match[1]!) * 12 + int.parse(match[2]!) - 1;
}

String _formatMonthIndex(int index) =>
    '${index ~/ 12}-${(index % 12 + 1).toString().padLeft(2, '0')}';

/// The invoice a pending row's default should settle. A paid month inside the
/// range ends the run, so a separately settled month is never recorded twice
/// and the later months stay pending. [singleMonth] selects only the earliest
/// month, for rows linked to several classes: one invoice records its months
/// for every linked class.
PendingTuitionCoverage pendingTuitionCoverage(
  Iterable<String> monthsOwed, {
  bool singleMonth = false,
}) {
  final indexes = monthsOwed.map(_monthIndex).nonNulls.toSet().toList()..sort();
  if (indexes.isEmpty) return (month: null, count: 1, last: null);

  final first = indexes.first;
  var count = 1;
  while (!singleMonth &&
      count < maxPrepaidMonthCount &&
      count < indexes.length &&
      indexes[count] == first + count) {
    count++;
  }
  return (
    month: _formatMonthIndex(first),
    count: count,
    last: _formatMonthIndex(first + count - 1),
  );
}
