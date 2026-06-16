import 'package:equatable/equatable.dart';
import 'package:mobile/data/models/finance/wallet.dart';

class WalletCheckpoint extends Equatable {
  const WalletCheckpoint({
    required this.id,
    required this.walletId,
    required this.actualBalance,
    required this.ledgerBalance,
    required this.currentLedgerBalance,
    required this.originalVariance,
    required this.currentVariance,
    required this.currency,
    required this.checkedAt,
    required this.createdAt,
    required this.updatedAt,
    this.createdBy,
    this.note,
  });

  factory WalletCheckpoint.fromJson(Map<String, dynamic> json) =>
      WalletCheckpoint(
        id: json['id'] as String,
        walletId: json['wallet_id'] as String,
        actualBalance: (json['actual_balance'] as num?)?.toDouble() ?? 0,
        ledgerBalance: (json['ledger_balance'] as num?)?.toDouble() ?? 0,
        currentLedgerBalance:
            (json['current_ledger_balance'] as num?)?.toDouble() ?? 0,
        originalVariance: (json['original_variance'] as num?)?.toDouble() ?? 0,
        currentVariance: (json['current_variance'] as num?)?.toDouble() ?? 0,
        currency: (json['currency'] as String?)?.trim().toUpperCase() ?? 'USD',
        checkedAt: DateTime.parse(json['checked_at'] as String),
        createdAt: DateTime.parse(json['created_at'] as String),
        updatedAt: DateTime.parse(json['updated_at'] as String),
        createdBy: json['created_by'] as String?,
        note: json['note'] as String?,
      );

  final String id;
  final String walletId;
  final double actualBalance;
  final double ledgerBalance;
  final double currentLedgerBalance;
  final double originalVariance;
  final double currentVariance;
  final String currency;
  final DateTime checkedAt;
  final DateTime createdAt;
  final DateTime updatedAt;
  final String? createdBy;
  final String? note;

  Map<String, dynamic> toJson() => {
    'id': id,
    'wallet_id': walletId,
    'actual_balance': actualBalance,
    'ledger_balance': ledgerBalance,
    'current_ledger_balance': currentLedgerBalance,
    'original_variance': originalVariance,
    'current_variance': currentVariance,
    'currency': currency,
    'checked_at': checkedAt.toIso8601String(),
    'created_at': createdAt.toIso8601String(),
    'updated_at': updatedAt.toIso8601String(),
    'created_by': createdBy,
    'note': note,
  };

  @override
  List<Object?> get props => [
    id,
    walletId,
    actualBalance,
    ledgerBalance,
    currentLedgerBalance,
    originalVariance,
    currentVariance,
    currency,
    checkedAt,
    createdAt,
    updatedAt,
    createdBy,
    note,
  ];
}

class WalletCheckpointInterval extends Equatable {
  const WalletCheckpointInterval({
    required this.startCheckpointId,
    required this.endCheckpointId,
    required this.startCheckedAt,
    required this.endCheckedAt,
    required this.startActualBalance,
    required this.endActualBalance,
    required this.actualDelta,
    required this.ledgerDelta,
    required this.intervalVariance,
    required this.transactionCount,
    required this.isClean,
  });

  factory WalletCheckpointInterval.fromJson(Map<String, dynamic> json) =>
      WalletCheckpointInterval(
        startCheckpointId: json['start_checkpoint_id'] as String,
        endCheckpointId: json['end_checkpoint_id'] as String,
        startCheckedAt: DateTime.parse(json['start_checked_at'] as String),
        endCheckedAt: DateTime.parse(json['end_checked_at'] as String),
        startActualBalance:
            (json['start_actual_balance'] as num?)?.toDouble() ?? 0,
        endActualBalance: (json['end_actual_balance'] as num?)?.toDouble() ?? 0,
        actualDelta: (json['actual_delta'] as num?)?.toDouble() ?? 0,
        ledgerDelta: (json['ledger_delta'] as num?)?.toDouble() ?? 0,
        intervalVariance: (json['interval_variance'] as num?)?.toDouble() ?? 0,
        transactionCount: (json['transaction_count'] as num?)?.toInt() ?? 0,
        isClean: json['is_clean'] as bool? ?? false,
      );

  final String startCheckpointId;
  final String endCheckpointId;
  final DateTime startCheckedAt;
  final DateTime endCheckedAt;
  final double startActualBalance;
  final double endActualBalance;
  final double actualDelta;
  final double ledgerDelta;
  final double intervalVariance;
  final int transactionCount;
  final bool isClean;

  @override
  List<Object?> get props => [
    startCheckpointId,
    endCheckpointId,
    startCheckedAt,
    endCheckedAt,
    startActualBalance,
    endActualBalance,
    actualDelta,
    ledgerDelta,
    intervalVariance,
    transactionCount,
    isClean,
  ];
}

class WalletCheckpointListResponse extends Equatable {
  const WalletCheckpointListResponse({
    required this.data,
    required this.intervals,
    this.latest,
  });

  factory WalletCheckpointListResponse.fromJson(Map<String, dynamic> json) =>
      WalletCheckpointListResponse(
        data: ((json['data'] as List<dynamic>?) ?? const <dynamic>[])
            .whereType<Map<String, dynamic>>()
            .map(WalletCheckpoint.fromJson)
            .toList(growable: false),
        intervals: ((json['intervals'] as List<dynamic>?) ?? const <dynamic>[])
            .whereType<Map<String, dynamic>>()
            .map(WalletCheckpointInterval.fromJson)
            .toList(growable: false),
        latest: json['latest'] is Map<String, dynamic>
            ? WalletCheckpoint.fromJson(json['latest'] as Map<String, dynamic>)
            : null,
      );

  final List<WalletCheckpoint> data;
  final List<WalletCheckpointInterval> intervals;
  final WalletCheckpoint? latest;

  @override
  List<Object?> get props => [data, intervals, latest];
}

class WalletCheckpointCurrencyTotal extends Equatable {
  const WalletCheckpointCurrencyTotal({
    required this.currency,
    required this.actualTotal,
    required this.ledgerTotal,
    required this.varianceTotal,
    required this.checkpointCount,
  });

  factory WalletCheckpointCurrencyTotal.fromJson(Map<String, dynamic> json) =>
      WalletCheckpointCurrencyTotal(
        currency: (json['currency'] as String?)?.trim().toUpperCase() ?? 'USD',
        actualTotal: (json['actual_total'] as num?)?.toDouble() ?? 0,
        ledgerTotal: (json['ledger_total'] as num?)?.toDouble() ?? 0,
        varianceTotal: (json['variance_total'] as num?)?.toDouble() ?? 0,
        checkpointCount: (json['checkpoint_count'] as num?)?.toInt() ?? 0,
      );

  final String currency;
  final double actualTotal;
  final double ledgerTotal;
  final double varianceTotal;
  final int checkpointCount;

  @override
  List<Object?> get props => [
    currency,
    actualTotal,
    ledgerTotal,
    varianceTotal,
    checkpointCount,
  ];
}

class WalletCheckpointBatchResponse extends Equatable {
  const WalletCheckpointBatchResponse({
    required this.data,
    required this.totalsByCurrency,
  });

  factory WalletCheckpointBatchResponse.fromJson(Map<String, dynamic> json) =>
      WalletCheckpointBatchResponse(
        data: ((json['data'] as List<dynamic>?) ?? const <dynamic>[])
            .whereType<Map<String, dynamic>>()
            .map(WalletCheckpoint.fromJson)
            .toList(growable: false),
        totalsByCurrency:
            ((json['totals_by_currency'] as List<dynamic>?) ??
                    const <dynamic>[])
                .whereType<Map<String, dynamic>>()
                .map(WalletCheckpointCurrencyTotal.fromJson)
                .toList(growable: false),
      );

  final List<WalletCheckpoint> data;
  final List<WalletCheckpointCurrencyTotal> totalsByCurrency;

  @override
  List<Object?> get props => [data, totalsByCurrency];
}

class WalletCheckpointBatchEntry extends Equatable {
  const WalletCheckpointBatchEntry({
    required this.walletId,
    required this.actualBalance,
    this.note,
  });

  final String walletId;
  final double actualBalance;
  final String? note;

  Map<String, dynamic> toJson() => {
    'wallet_id': walletId,
    'actual_balance': actualBalance,
    'note': note,
  };

  @override
  List<Object?> get props => [walletId, actualBalance, note];
}

class WalletCheckpointSummaryResponse extends Equatable {
  const WalletCheckpointSummaryResponse({
    required this.wallets,
    required this.latestCheckpoints,
    required this.totalsByCurrency,
  });

  factory WalletCheckpointSummaryResponse.fromJson(
    Map<String, dynamic> json,
  ) => WalletCheckpointSummaryResponse(
    wallets: ((json['wallets'] as List<dynamic>?) ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(Wallet.fromJson)
        .toList(growable: false),
    latestCheckpoints:
        ((json['latest_checkpoints'] as List<dynamic>?) ?? const <dynamic>[])
            .whereType<Map<String, dynamic>>()
            .map(WalletCheckpoint.fromJson)
            .toList(growable: false),
    totalsByCurrency:
        ((json['totals_by_currency'] as List<dynamic>?) ?? const <dynamic>[])
            .whereType<Map<String, dynamic>>()
            .map(WalletCheckpointCurrencyTotal.fromJson)
            .toList(growable: false),
  );

  final List<Wallet> wallets;
  final List<WalletCheckpoint> latestCheckpoints;
  final List<WalletCheckpointCurrencyTotal> totalsByCurrency;

  @override
  List<Object?> get props => [wallets, latestCheckpoints, totalsByCurrency];
}

class WalletCheckpointReconciliationResponse extends Equatable {
  const WalletCheckpointReconciliationResponse({
    required this.checkedAt,
    required this.checkpointId,
    required this.created,
    required this.offsetAmount,
    required this.walletId,
    this.transactionId,
  });

  factory WalletCheckpointReconciliationResponse.fromJson(
    Map<String, dynamic> json,
  ) => WalletCheckpointReconciliationResponse(
    checkedAt: DateTime.parse(json['checked_at'] as String),
    checkpointId: json['checkpoint_id'] as String,
    created: json['created'] as bool? ?? false,
    offsetAmount: (json['offset_amount'] as num?)?.toDouble() ?? 0,
    transactionId: json['transaction_id'] as String?,
    walletId: json['wallet_id'] as String,
  );

  final DateTime checkedAt;
  final String checkpointId;
  final bool created;
  final double offsetAmount;
  final String? transactionId;
  final String walletId;

  @override
  List<Object?> get props => [
    checkedAt,
    checkpointId,
    created,
    offsetAmount,
    transactionId,
    walletId,
  ];
}
