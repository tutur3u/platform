part of 'finance_inventory_offline_test.dart';

Map<String, dynamic> _product(
  String id,
  String name,
  int day, {
  String? description,
  bool archived = false,
}) => {
  'id': id,
  'name': name,
  'description': description,
  'ws_id': 'ws',
  'category_id': 'category',
  'owner_id': 'owner',
  'archived': archived,
  'created_at': '2026-10-${day.toString().padLeft(2, '0')}T00:00:00Z',
  'inventory': <Map<String, dynamic>>[],
};
Map<String, dynamic> _transaction(String id, String description, int day) => {
  'id': id,
  'description': description,
  'wallet_id': 'wallet',
  'amount': -10,
  'taken_at': '2026-10-${day.toString().padLeft(2, '0')}T00:00:00Z',
};
Map<String, dynamic> _sale(String id, int day) => {
  'id': id,
  'notice': 'Sale $id',
  'paid_amount': 100,
  'created_at': '2026-10-${day.toString().padLeft(2, '0')}T00:00:00Z',
  'owners': <String>[],
  'lines': <Map<String, dynamic>>[],
};

void _registerOfflineBudgetTest({
  required FinanceRepository Function() repository,
  required _Api Function() apiClient,
}) {
  test('an offline budget create appears as pending on a cold list', () async {
    final finance = repository();
    final api = apiClient();
    when(
      () => api.getJsonList(any()),
    ).thenThrow(const ApiException.transport(message: 'Offline'));
    final result = await finance.createBudget(
      wsId: 'ws',
      budget: FinanceBudget(
        id: '',
        name: 'Equipment',
        amount: 125,
        startDate: DateTime(2026, 11),
      ),
    );
    expect(result, FinanceBudgetWrite.pending);
    verifyNever(() => api.postJson(any(), any()));

    final list = await finance.getBudgets('ws', forceRefresh: true);
    final budget = list.budgets.single;
    expect(budget.name, 'Equipment');
    expect(budget.amount, 125);
    expect(budget.id, isNotEmpty);
    expect(list.pendingIds, {budget.id});
    await expectLater(
      finance.getBudgets('other-workspace'),
      throwsA(isA<ApiException>()),
    );
  });
}
