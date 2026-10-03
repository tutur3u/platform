part of 'finance_repository.dart';

mixin FinanceRepositoryMutations {
  ApiClient get _api;
  OfflineMutationQueue get _mutationQueue;

  Future<Transaction> updateTransaction({
    required String wsId,
    required String transactionId,
    required double amount,
    String? description,
    DateTime? takenAt,
    String? walletId,
    String? categoryId,
    List<String>? tagIds,
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

    if (tagIds != null) {
      body['tag_ids'] = tagIds;
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

    if (await _mutationQueue.enqueueIfOffline(
      feature: 'finance',
      method: 'PUT',
      path: FinanceEndpoints.transaction(wsId, transactionId),
      workspaceId: wsId,
      payload: body,
      entityId: transactionId,
    )) {
      return Transaction(
        id: transactionId,
        amount: amount,
        description: description,
        walletId: walletId,
        categoryId: categoryId,
        takenAt: takenAt,
      );
    }
    final path = FinanceEndpoints.transaction(wsId, transactionId);
    final local = Transaction(
      id: transactionId,
      amount: amount,
      description: description,
      walletId: walletId,
      categoryId: categoryId,
      takenAt: takenAt,
    );
    try {
      await _api.putJson(path, body);
    } on ApiException catch (error) {
      if (await _mutationQueue.enqueueAfterNetworkFailure(
        error: error,
        feature: 'finance',
        method: 'PUT',
        path: path,
        workspaceId: wsId,
        payload: body,
        entityId: transactionId,
        replaySafe: false,
      )) {
        return local;
      }
      rethrow;
    }
    try {
      return Transaction.fromJson(await _api.getJson(path));
    } on ApiException {
      // The write was acknowledged. A failed detail refresh must not invite
      // another money mutation.
      return local;
    }
  }

  Future<String?> createTransaction({
    required String wsId,
    required double amount,
    required DateTime takenAt,
    required String walletId,
    String? description,
    String? categoryId,
    List<String>? tagIds,
    bool? reportOptIn,
    bool? isAmountConfidential,
    bool? isDescriptionConfidential,
    bool? isCategoryConfidential,
  }) async {
    final body = <String, dynamic>{
      'amount': amount,
      'origin_wallet_id': walletId,
      'taken_at': takenAt.toUtc().toIso8601String(),
    };

    if (description != null) {
      body['description'] = description;
    }

    if (categoryId != null) {
      body['category_id'] = categoryId;
    }

    if (tagIds != null) {
      body['tag_ids'] = tagIds;
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

    final transactionId = newLocalMutationId();
    body['client_transaction_id'] = transactionId;
    if (await _mutationQueue.enqueueIfOffline(
      feature: 'finance',
      method: 'POST',
      path: FinanceEndpoints.transactions(wsId),
      workspaceId: wsId,
      payload: body,
      entityId: transactionId,
      replaySafe: true,
    )) {
      return transactionId;
    }
    try {
      final response = await _api.postJson(
        FinanceEndpoints.transactions(wsId),
        body,
      );
      return response['transaction_id'] as String?;
    } on ApiException catch (error) {
      if (await _mutationQueue.enqueueAfterNetworkFailure(
        error: error,
        feature: 'finance',
        method: 'POST',
        path: FinanceEndpoints.transactions(wsId),
        workspaceId: wsId,
        payload: body,
        entityId: transactionId,
        replaySafe: true,
      )) {
        return transactionId;
      }
      rethrow;
    }
  }

  Future<String?> createTransfer({
    required String wsId,
    required String originWalletId,
    required String destinationWalletId,
    required double amount,
    DateTime? takenAt,
    String? description,
    double? destinationAmount,
    bool? reportOptIn,
    List<String>? tagIds,
  }) async {
    final body = <String, dynamic>{
      'origin_wallet_id': originWalletId,
      'destination_wallet_id': destinationWalletId,
      'amount': amount,
      'taken_at': (takenAt ?? DateTime.now()).toUtc().toIso8601String(),
    };

    if (description != null) {
      body['description'] = description;
    }

    if (destinationAmount != null) {
      body['destination_amount'] = destinationAmount;
    }

    if (reportOptIn != null) {
      body['report_opt_in'] = reportOptIn;
    }

    if (tagIds != null) {
      body['tag_ids'] = tagIds;
    }

    final originId = newLocalMutationId();
    final destinationId = newLocalMutationId();
    body['client_origin_transaction_id'] = originId;
    body['client_destination_transaction_id'] = destinationId;
    if (await _mutationQueue.enqueueIfOffline(
      feature: 'finance',
      method: 'POST',
      path: FinanceEndpoints.transfers(wsId),
      workspaceId: wsId,
      payload: body,
      entityId: originId,
      replaySafe: true,
    )) {
      return originId;
    }
    try {
      final response = await _api.postJson(
        FinanceEndpoints.transfers(wsId),
        body,
      );
      return response['from_transaction_id'] as String?;
    } on ApiException catch (error) {
      if (await _mutationQueue.enqueueAfterNetworkFailure(
        error: error,
        feature: 'finance',
        method: 'POST',
        path: FinanceEndpoints.transfers(wsId),
        workspaceId: wsId,
        payload: body,
        entityId: originId,
        replaySafe: true,
      )) {
        return originId;
      }
      rethrow;
    }
  }

  Future<Transaction> updateTransfer({
    required String wsId,
    required String originTransactionId,
    required String destinationTransactionId,
    required String originWalletId,
    required String destinationWalletId,
    required double amount,
    required DateTime takenAt,
    required String refreshedTransactionId,
    String? description,
    double? destinationAmount,
    bool? reportOptIn,
    List<String>? tagIds,
  }) async {
    final body = <String, dynamic>{
      'origin_transaction_id': originTransactionId,
      'destination_transaction_id': destinationTransactionId,
      'origin_wallet_id': originWalletId,
      'destination_wallet_id': destinationWalletId,
      'amount': amount,
      'taken_at': takenAt.toUtc().toIso8601String(),
    };

    if (description != null) {
      body['description'] = description;
    }

    if (destinationAmount != null) {
      body['destination_amount'] = destinationAmount;
    }

    if (reportOptIn != null) {
      body['report_opt_in'] = reportOptIn;
    }

    if (tagIds != null) {
      body['tag_ids'] = tagIds;
    }

    if (await _mutationQueue.enqueueIfOffline(
      feature: 'finance',
      method: 'PUT',
      path: FinanceEndpoints.transfers(wsId),
      workspaceId: wsId,
      payload: body,
      entityId: refreshedTransactionId,
    )) {
      return Transaction(
        id: refreshedTransactionId,
        amount: amount,
        description: description,
        walletId: originWalletId,
        takenAt: takenAt,
      );
    }
    final path = FinanceEndpoints.transfers(wsId);
    final local = Transaction(
      id: refreshedTransactionId,
      amount: amount,
      description: description,
      walletId: originWalletId,
      takenAt: takenAt,
    );
    try {
      await _api.putJson(path, body);
    } on ApiException catch (error) {
      if (await _mutationQueue.enqueueAfterNetworkFailure(
        error: error,
        feature: 'finance',
        method: 'PUT',
        path: path,
        workspaceId: wsId,
        payload: body,
        entityId: refreshedTransactionId,
        replaySafe: false,
      )) {
        return local;
      }
      rethrow;
    }
    try {
      return Transaction.fromJson(
        await _api.getJson(
          FinanceEndpoints.transaction(wsId, refreshedTransactionId),
        ),
      );
    } on ApiException {
      return local;
    }
  }

  Future<void> deleteTransaction({
    required String wsId,
    required String transactionId,
  }) async {
    if (await _mutationQueue.enqueueIfOffline(
      feature: 'finance',
      method: 'DELETE',
      path: FinanceEndpoints.transaction(wsId, transactionId),
      workspaceId: wsId,
      entityId: transactionId,
    )) {
      return;
    }
    final path = FinanceEndpoints.transaction(wsId, transactionId);
    try {
      await _api.deleteJson(path);
    } on ApiException catch (error) {
      if (!await _mutationQueue.enqueueAfterNetworkFailure(
        error: error,
        feature: 'finance',
        method: 'DELETE',
        path: path,
        workspaceId: wsId,
        payload: const {},
        entityId: transactionId,
        replaySafe: false,
      )) {
        rethrow;
      }
    }
  }
}
