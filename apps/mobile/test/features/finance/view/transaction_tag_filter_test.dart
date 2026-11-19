import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/finance/tag.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/data/models/finance/transaction_query.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/features/finance/cubit/transaction_list_cubit.dart';
import 'package:mobile/features/finance/view/transaction_list_filters.dart';

import '../../../helpers/pump_app.dart';
import 'finance_scenes.dart';

void main() {
  test('tag selection scopes the API and cached transactions', () {
    final base = FinanceTransactionQuery.month(DateTime(2026, 11, 14));
    final filtered = base.copyWith(tagId: 'subscription');
    const matched = TransactionTag(id: 'subscription', name: 'Subscription');
    final date = DateTime(2026, 11, 14);
    expect(filtered.toParams()['tagIds'], 'subscription');
    expect(
      filtered.matches(
        Transaction(id: 'tagged', takenAt: date, tags: const [matched]),
      ),
      isTrue,
    );
    expect(
      filtered.matches(Transaction(id: 'untagged', takenAt: date)),
      isFalse,
    );
    expect(filtered.cacheKey, isNot(base.cacheKey));
    expect(filtered.copyWith(tagId: null), base);
  });

  testWidgets('the tag chip applies the chosen transaction tag', (
    tester,
  ) async {
    FinanceTransactionQuery? selected;
    await tester.pumpThemedHome(
      FinanceScreenScene(
        scene: FinanceScene.transactions,
        page: RepositoryProvider<FinanceRepository>(
          create: (_) => _TagRepository(),
          child: TransactionListFilters(
            state: const TransactionListState(),
            showTagFilter: true,
            onChanged: (query, _) => selected = query,
          ),
        ),
      ),
    );
    final chip = find.byKey(const ValueKey('finance-filter-tag'));
    await tester.ensureVisible(chip);
    await tester.tap(chip);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Subscription'));
    await tester.pumpAndSettle();
    expect(selected?.tagId, 'subscription');
  });
}

class _TagRepository extends FinanceSceneRepository {
  @override
  Future<List<FinanceTag>> getTags(String wsId) async => const [
    FinanceTag(id: 'subscription', name: 'Subscription'),
  ];
}
