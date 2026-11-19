import 'package:equatable/equatable.dart';
import 'package:mobile/data/models/finance/transaction.dart';

/// Kind of transactions a list or total covers.
enum FinanceTransactionKind { all, income, expense, transfer }

/// Filters for transaction lists and totals beyond search and wallet: kind,
/// one category, one tag and a local date range (start inclusive, end
/// exclusive).
class FinanceTransactionQuery extends Equatable {
  const FinanceTransactionQuery({
    this.kind = FinanceTransactionKind.all,
    this.categoryId,
    this.tagId,
    this.start,
    this.end,
  });

  /// The calendar month containing [date], in local time.
  factory FinanceTransactionQuery.month(
    DateTime date, {
    FinanceTransactionKind kind = FinanceTransactionKind.all,
    String? categoryId,
  }) => FinanceTransactionQuery(
    kind: kind,
    categoryId: categoryId,
    start: DateTime(date.year, date.month),
    end: DateTime(date.year, date.month + 1),
  );

  final FinanceTransactionKind kind;
  final String? categoryId;
  final String? tagId;
  final DateTime? start;
  final DateTime? end;

  bool get isEmpty =>
      kind == FinanceTransactionKind.all &&
      categoryId == null &&
      tagId == null &&
      start == null &&
      end == null;

  FinanceTransactionQuery copyWith({
    FinanceTransactionKind? kind,
    Object? categoryId = _keep,
    Object? tagId = _keep,
    Object? start = _keep,
    Object? end = _keep,
  }) => FinanceTransactionQuery(
    kind: kind ?? this.kind,
    categoryId: categoryId == _keep ? this.categoryId : categoryId as String?,
    tagId: tagId == _keep ? this.tagId : tagId as String?,
    start: start == _keep ? this.start : start as DateTime?,
    end: end == _keep ? this.end : end as DateTime?,
  );

  /// Query parameters for the transactions `infinite` and `stats` routes.
  /// Transfers have no server-side kind, so they filter on the client.
  Map<String, String> toParams() => {
    if (kind == FinanceTransactionKind.income) 'transactionType': 'income',
    if (kind == FinanceTransactionKind.expense) 'transactionType': 'expense',
    if (categoryId != null) 'categoryIds': categoryId!,
    if (tagId != null) 'tagIds': tagId!,
    if (start != null) 'start': start!.toUtc().toIso8601String(),
    if (end != null)
      'end': end!
          .subtract(const Duration(milliseconds: 1))
          .toUtc()
          .toIso8601String(),
  };

  /// Whether [transaction] belongs to this query, for cached and offline
  /// rows and for the transfer kind.
  bool matches(Transaction transaction) {
    final amount = transaction.amount ?? 0;
    final kindMatches = switch (kind) {
      FinanceTransactionKind.all => true,
      FinanceTransactionKind.income => !transaction.isTransfer && amount > 0,
      FinanceTransactionKind.expense => !transaction.isTransfer && amount < 0,
      FinanceTransactionKind.transfer => transaction.isTransfer,
    };
    if (!kindMatches) return false;
    if (categoryId != null && transaction.categoryId != categoryId) {
      return false;
    }
    final tag = tagId;
    if (tag != null && !transaction.tags.any((item) => item.id == tag)) {
      return false;
    }
    final at = (transaction.takenAt ?? transaction.createdAt)?.toLocal();
    if (start != null && (at == null || at.isBefore(start!))) return false;
    if (end != null && (at == null || !at.isBefore(end!))) return false;
    return true;
  }

  /// Short stable key for caches.
  String get cacheKey => isEmpty
      ? ''
      : [
          kind.name,
          categoryId ?? '',
          start?.toIso8601String() ?? '',
          end?.toIso8601String() ?? '',
          if (tagId case final tag?) tag,
        ].join('|');

  @override
  List<Object?> get props => [kind, categoryId, start, end, tagId];
}

const _keep = Object();
