import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/data/models/finance/transaction_query.dart';

void main() {
  test('creator and date filters compose with cached and server rows', () {
    final query = const FinanceTransactionQuery(
      creatorId: 'person',
    ).withDateRange(DateTime(2026, 10, 30), DateTime(2026, 11));
    final row = Transaction.fromJson({
      'id': 'match',
      'creator_id': 'legacy',
      'platform_creator_id': 'person',
      'taken_at': DateTime(2026, 11, 1, 23, 59, 59).toIso8601String(),
    });
    expect(query.matches(Transaction.fromJson(row.toJson())), isTrue);
    expect(
      query.matches(row.copyWith(takenAt: DateTime(2026, 11, 2))),
      isFalse,
    );
    expect(query.copyWith(creatorId: 'legacy').matches(row), isTrue);
    expect(query.copyWith(creatorId: 'another').matches(row), isFalse);
    expect(query.inclusiveEnd, DateTime(2026, 11));
    expect(query.toParams()['userIds'], 'person');
    expect(
      query.toParams()['end'],
      DateTime(2026, 11, 1, 23, 59, 59, 999).toUtc().toIso8601String(),
    );
    expect(query.cacheKey, isNot(query.copyWith(creatorId: null).cacheKey));
  });
}
