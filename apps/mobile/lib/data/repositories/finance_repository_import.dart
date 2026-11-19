part of 'finance_repository.dart';

mixin FinanceRepositoryImport {
  ApiClient get _api;
  CacheStore get _cacheStore;
  String? Function() get _cacheUserId;

  Future<FinanceImportResult> importMoneyLover({
    required String workspace,
    required List<Map<String, String>> rows,
    required bool Function() active,
  }) async {
    final user = _cacheUserId();
    if (rows.isEmpty || rows.length > moneyLoverMaximumRows || !active()) {
      throw const FormatException('No valid import to submit.');
    }
    final wallets = user == null
        ? await _api.getJsonList(FinanceEndpoints.wallets(workspace))
        : await ApiClient.runForUser(
            user,
            () => _api.getJsonList(FinanceEndpoints.wallets(workspace)),
          );
    final byName = <String, List<String?>>{};
    for (final raw in wallets.cast<Map<String, dynamic>>()) {
      final wallet = Wallet.fromJson(raw);
      final name = wallet.name?.toLowerCase();
      if (name != null) {
        (byName[name] ??= []).add(wallet.currency?.toUpperCase());
      }
    }
    for (final row in rows) {
      final currencies = byName[row['wallet']!.toLowerCase()];
      if (currencies == null ||
          currencies.length != 1 ||
          currencies.single != row['currency']!.toUpperCase()) {
        throw const FinanceImportWalletMismatch();
      }
    }
    if (!active() || user != _cacheUserId()) {
      throw const FormatException('Import scope changed.');
    }
    final path =
        '${FinanceEndpoints.transactions(workspace)}/import/money-lover';
    Future<http.StreamedResponse> send() => _api.sendMultipartStream(
      'POST',
      path,
      fields: {'transactions': jsonEncode(rows)},
      accept: 'text/event-stream',
      active: active,
    );
    final response = user == null
        ? await send()
        : await ApiClient.runForUser(user, send);
    if (response.statusCode != 200) {
      await response.stream.listen(null).cancel();
      throw ApiException(
        message: 'Transaction import failed',
        statusCode: response.statusCode,
      );
    }
    try {
      await for (final line
          in response.stream
              .transform(utf8.decoder)
              .transform(const LineSplitter())
              .timeout(const Duration(seconds: 45))) {
        if (!line.startsWith('data:')) continue;
        final event =
            jsonDecode(line.substring(5).trim()) as Map<String, dynamic>;
        switch (event['type']) {
          case 'complete':
            return (
              imported: event['imported'] as int,
              total: event['total'] as int,
              errors: (event['errors'] as List?)?.length ?? 0,
            );
          case 'error':
            throw const FormatException(
              'Server did not confirm transaction import.',
            );
        }
      }
      throw const FormatException('Missing transaction import receipt.');
    } finally {
      if (user != null && user == _cacheUserId()) {
        try {
          await _cacheStore.invalidateTags(
            const ['module:finance'],
            workspaceId: workspace,
            userId: user,
          );
        } on Object catch (error) {
          debugPrint(
            'Could not refresh import-related caches: ${error.runtimeType}',
          );
        }
      }
    }
  }
}

class FinanceImportWalletMismatch implements Exception {
  const FinanceImportWalletMismatch();
}
