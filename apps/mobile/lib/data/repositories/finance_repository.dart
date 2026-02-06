import 'package:mobile/data/models/finance/category.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/sources/supabase_client.dart';

/// Repository for finance operations (wallets, transactions, categories).
class FinanceRepository {
  // ── Wallets ─────────────────────────────────────

  Future<List<Wallet>> getWallets(String wsId) async {
    final response = await supabase
        .from('workspace_wallets')
        .select()
        .eq('ws_id', wsId)
        .order('name');

    return (response as List<dynamic>)
        .map((e) => Wallet.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Wallet?> getWalletById(String walletId) async {
    final response = await supabase
        .from('workspace_wallets')
        .select()
        .eq('id', walletId)
        .maybeSingle();

    if (response == null) return null;
    return Wallet.fromJson(response);
  }

  // ── Transactions ────────────────────────────────

  Future<List<Transaction>> getTransactions(
    String wsId, {
    String? walletId,
    int limit = 50,
    int offset = 0,
  }) async {
    var query = supabase
        .from('wallet_transactions')
        .select()
        .eq('ws_id', wsId);

    if (walletId != null) {
      query = query.eq('wallet_id', walletId);
    }

    final response = await query
        .order('taken_at', ascending: false)
        .range(offset, offset + limit - 1);

    return (response as List<dynamic>)
        .map((e) => Transaction.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  // ── Categories ──────────────────────────────────

  Future<List<TransactionCategory>> getCategories(String wsId) async {
    final response = await supabase
        .from('transaction_categories')
        .select()
        .eq('ws_id', wsId)
        .order('name');

    return (response as List<dynamic>)
        .map((e) => TransactionCategory.fromJson(e as Map<String, dynamic>))
        .toList();
  }
}
