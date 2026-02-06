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

  /// Fetches transactions for the given [walletIds].
  ///
  /// `wallet_transactions` does not have a `ws_id` column — transactions are
  /// scoped through their wallet's workspace. Call [getWallets] first to obtain
  /// the wallet IDs for a workspace.
  Future<List<Transaction>> getTransactions({
    required List<String> walletIds,
    int limit = 50,
    int offset = 0,
  }) async {
    if (walletIds.isEmpty) return [];

    final response = await supabase
        .from('wallet_transactions')
        .select('''
          *,
          category:transaction_categories(name),
          wallet:workspace_wallets(name, currency)
        ''')
        .inFilter('wallet_id', walletIds)
        .order('taken_at', ascending: false)
        .range(offset, offset + limit - 1);

    return (response as List<dynamic>)
        .map((e) => Transaction.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Cursor-based paginated transaction fetch, mirroring the web's
  /// `/api/workspaces/[wsId]/transactions/infinite` endpoint.
  ///
  /// [cursor] is a composite `{taken_at}_{created_at}` string.  Pass `null`
  /// for the first page.  Returns `limit + 1` rows so the caller can detect
  /// whether more pages exist (pop the extra row if present).
  Future<List<Transaction>> getTransactionsPaginated({
    required List<String> walletIds,
    int limit = 20,
    String? cursor,
    String? search,
  }) async {
    if (walletIds.isEmpty) return [];

    // Filters must be applied *before* order/limit (PostgREST builder types).
    var query = supabase
        .from('wallet_transactions')
        .select('''
          *,
          category:transaction_categories(name),
          wallet:workspace_wallets(name, currency)
        ''')
        .inFilter('wallet_id', walletIds);

    // Cursor filter — fetch rows *before* the cursor position.
    if (cursor != null) {
      final parts = cursor.split('_');
      if (parts.length >= 2) {
        final takenAt = parts.sublist(0, parts.length - 1).join('_');
        query = query.lt('taken_at', takenAt);
      }
    }

    // Text search on description (PostgREST ilike).
    if (search != null && search.isNotEmpty) {
      query = query.ilike('description', '%$search%');
    }

    // Order + fetch one extra to detect hasMore.
    final response = await query
        .order('taken_at', ascending: false)
        .order('created_at', ascending: false)
        .limit(limit + 1);

    return (response as List<dynamic>)
        .map(
          (e) => Transaction.fromJson(e as Map<String, dynamic>),
        )
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
