part of 'finance_repository.dart';

mixin FinanceRepositoryInterest {
  ApiClient get _api;
  String? Function() get _cacheUserId;

  String _interestPath(String workspace, String wallet) =>
      '${FinanceEndpoints.wallet(Uri.encodeComponent(workspace), Uri.encodeComponent(wallet))}/interest';

  Future<bool> isWalletInterestSetupEnabled(String workspace) async {
    final path = FinanceEndpoints.workspaceConfig(
      workspace,
      'ENABLE_EXPERIMENTAL_FINANCE',
    );
    try {
      final response = await _readInterest(path);
      return response['value'] == 'true' || response['value'] == true;
    } on ApiException catch (error) {
      if (error.statusCode == 404 || error.statusCode == 403) return false;
      rethrow;
    }
  }

  Future<WalletInterest> getWalletInterest(
    String workspace,
    String wallet,
  ) async => WalletInterest.fromJson(
    await _readInterest(_interestPath(workspace, wallet)),
  );

  Future<num> getWalletHistoricalInterest(
    String workspace,
    String wallet, {
    required String from,
    required String to,
  }) async {
    final query = Uri(queryParameters: {'from': from, 'to': to}).query;
    final response = await _readInterest(
      '${_interestPath(workspace, wallet)}/calculate?$query',
    );
    return response['totalInterest'] as num;
  }

  Future<Map<String, dynamic>> _readInterest(String path) {
    final user = _cacheUserId();
    Future<Map<String, dynamic>> request() => _api.getJson(path);
    return user == null ? request() : ApiClient.runForUser(user, request);
  }

  Future<void> enableWalletInterest(
    String workspace,
    String wallet, {
    required WalletInterestProvider provider,
    required WalletInterestTier? tier,
    required String? start,
    required bool Function() active,
  }) => _writeInterest('POST', _interestPath(workspace, wallet), {
    'provider': provider.name,
    if (tier != null) 'zalopay_tier': tier.name,
    if (start != null) 'tracking_start_date': start,
  }, active);

  Future<void> updateWalletInterest(
    String workspace,
    String wallet,
    Map<String, Object?> changes, {
    required bool Function() active,
  }) => _writeInterest(
    'PUT',
    '${_interestPath(workspace, wallet)}/config',
    changes,
    active,
  );

  Future<void> addWalletInterestRate(
    String workspace,
    String wallet, {
    required double percent,
    required String? effectiveFrom,
    required bool Function() active,
  }) => _writeInterest('POST', '${_interestPath(workspace, wallet)}/rates', {
    'annual_rate': percent,
    if (effectiveFrom != null) 'effective_from': effectiveFrom,
  }, active);

  Future<void> deleteWalletInterest(
    String workspace,
    String wallet, {
    required bool Function() active,
  }) => _writeInterest(
    'DELETE',
    '${_interestPath(workspace, wallet)}/config',
    null,
    active,
  );

  Future<void> _writeInterest(
    String method,
    String path,
    Map<String, Object?>? body,
    bool Function() active,
  ) async {
    final actor = _cacheUserId();
    if (actor == null || !active()) {
      throw const ApiException(message: 'Request scope changed', statusCode: 0);
    }
    final response = await _api.sendJsonStreamAcknowledged(
      method,
      path,
      body,
      admission: ApiMutationAdmission(
        actorId: actor,
        isCurrent: () => active() && _cacheUserId() == actor,
      ),
      accept: 'application/json',
    );
    await response.stream.timeout(const Duration(seconds: 15)).drain<void>();
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(
        message: 'Interest settings were not updated',
        statusCode: response.statusCode,
      );
    }
  }
}
