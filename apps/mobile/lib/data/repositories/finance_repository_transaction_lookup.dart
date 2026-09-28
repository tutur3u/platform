part of 'finance_repository.dart';

extension FinanceRepositoryTransactionLookup on FinanceRepository {
  Future<Transaction?> getTransactionById({
    required String wsId,
    required String transactionId,
  }) async {
    final response = await supabase
        .from('wallet_transactions')
        .select(
          '*,workspace_wallets!inner(ws_id),'
          'category:transaction_categories(name)',
        )
        .eq('id', transactionId)
        .eq('workspace_wallets.ws_id', wsId)
        .maybeSingle();
    return response == null ? null : Transaction.fromJson(response);
  }
}
