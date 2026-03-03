import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/models/finance/category.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/data/sources/supabase_client.dart';

/// Repository for finance operations (wallets, transactions, categories).
class FinanceRepository {
  FinanceRepository({ApiClient? apiClient}) : _api = apiClient ?? ApiClient();

  final ApiClient _api;

  // ── Wallets ─────────────────────────────────────

  Future<List<Wallet>> getWallets(String wsId) async {
    final response = await _api.getJsonList(FinanceEndpoints.wallets(wsId));

    return response
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

  Future<void> createWallet({
    required String wsId,
    required String name,
    required String type,
    required String currency,
    String? description,
    String? icon,
    String? imageSrc,
    double? limit,
    int? statementDate,
    int? paymentDate,
  }) async {
    await _api.postJson(FinanceEndpoints.wallets(wsId), {
      'name': name,
      'description': description,
      'type': type,
      'currency': currency,
      'icon': icon,
      'image_src': imageSrc,
      'limit': limit,
      'statement_date': statementDate,
      'payment_date': paymentDate,
    });
  }

  Future<void> updateWallet({
    required String wsId,
    required String walletId,
    required String name,
    required String type,
    required String currency,
    String? description,
    String? icon,
    String? imageSrc,
    double? limit,
    int? statementDate,
    int? paymentDate,
  }) async {
    await _api.putJson(FinanceEndpoints.wallet(wsId, walletId), {
      'name': name,
      'description': description,
      'type': type,
      'currency': currency,
      'icon': icon,
      'image_src': imageSrc,
      'limit': limit,
      'statement_date': statementDate,
      'payment_date': paymentDate,
    });
  }

  Future<void> deleteWallet({
    required String wsId,
    required String walletId,
  }) async {
    await _api.deleteJson(FinanceEndpoints.wallet(wsId, walletId));
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

  /// Cursor-based paginated fetch via the web API
  /// (`/api/workspaces/[wsId]/transactions/infinite`).
  ///
  /// Returns an [InfiniteTransactionResponse] with enriched transaction data
  /// (tags, category icon/color, creator, transfer metadata).
  Future<InfiniteTransactionResponse> getTransactionsInfinite({
    required String wsId,
    int limit = 20,
    String? cursor,
    String? search,
  }) async {
    final params = <String, String>{'limit': limit.toString()};
    if (cursor != null) params['cursor'] = cursor;
    if (search != null && search.isNotEmpty) params['q'] = search;

    final query = Uri(queryParameters: params).query;
    final response = await _api.getJson(
      '${FinanceEndpoints.infiniteTransactions(wsId)}?$query',
    );

    return InfiniteTransactionResponse.fromJson(response);
  }

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

  Future<Transaction> updateTransaction({
    required String wsId,
    required String transactionId,
    required double amount,
    String? description,
    DateTime? takenAt,
    String? walletId,
    String? categoryId,
    bool? reportOptIn,
    bool? isAmountConfidential,
    bool? isDescriptionConfidential,
    bool? isCategoryConfidential,
  }) async {
    final body = <String, dynamic>{'amount': amount};

    if (description != null) {
      body['description'] = description;
    }

    if (takenAt != null) {
      body['taken_at'] = takenAt.toUtc().toIso8601String();
    }

    if (walletId != null) {
      body['origin_wallet_id'] = walletId;
    }

    if (categoryId != null) {
      body['category_id'] = categoryId;
    }

    if (reportOptIn != null) {
      body['report_opt_in'] = reportOptIn;
    }

    if (isAmountConfidential != null) {
      body['is_amount_confidential'] = isAmountConfidential;
    }

    if (isDescriptionConfidential != null) {
      body['is_description_confidential'] = isDescriptionConfidential;
    }

    if (isCategoryConfidential != null) {
      body['is_category_confidential'] = isCategoryConfidential;
    }

    await _api.putJson(FinanceEndpoints.transaction(wsId, transactionId), body);

    final refreshed = await _api.getJson(
      FinanceEndpoints.transaction(wsId, transactionId),
    );

    return Transaction.fromJson(refreshed);
  }

  Future<void> deleteTransaction({
    required String wsId,
    required String transactionId,
  }) async {
    await _api.deleteJson(FinanceEndpoints.transaction(wsId, transactionId));
  }

  // ── Categories ──────────────────────────────────

  Future<List<TransactionCategory>> getCategories(String wsId) async {
    final response = await _api.getJsonList(FinanceEndpoints.categories(wsId));

    return response
        .map((e) => TransactionCategory.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<void> createCategory({
    required String wsId,
    required String name,
    required bool isExpense,
    String? icon,
    String? color,
  }) async {
    await _api.postJson(FinanceEndpoints.categories(wsId), {
      'name': name,
      'is_expense': isExpense,
      'icon': icon,
      'color': color,
    });
  }

  Future<void> updateCategory({
    required String wsId,
    required String categoryId,
    required String name,
    required bool isExpense,
    String? icon,
    String? color,
  }) async {
    final body = <String, dynamic>{
      'name': name,
      'is_expense': isExpense,
    };

    if (icon != null) {
      body['icon'] = icon;
    }

    if (color != null) {
      body['color'] = color;
    }

    await _api.putJson(FinanceEndpoints.category(wsId, categoryId), body);
  }

  Future<void> deleteCategory({
    required String wsId,
    required String categoryId,
  }) async {
    await _api.deleteJson(FinanceEndpoints.category(wsId, categoryId));
  }
}
