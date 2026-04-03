import 'package:equatable/equatable.dart';

// ── Tag ────────────────────────────────────────────────────────────────────

class TransactionTag extends Equatable {
  const TransactionTag({
    required this.id,
    required this.name,
    this.color,
  });

  factory TransactionTag.fromJson(Map<String, dynamic> json) => TransactionTag(
    id: json['id'] as String,
    name: json['name'] as String,
    color: json['color'] as String?,
  );

  final String id;
  final String name;
  final String? color;

  @override
  List<Object?> get props => [id, name, color];
}

// ── Transfer metadata ──────────────────────────────────────────────────────

class TransactionTransfer extends Equatable {
  const TransactionTransfer({
    required this.linkedTransactionId,
    required this.linkedWalletId,
    required this.linkedWalletName,
    this.linkedWalletCurrency,
    this.linkedAmount,
    this.isOrigin = false,
  });

  factory TransactionTransfer.fromJson(Map<String, dynamic> json) =>
      TransactionTransfer(
        linkedTransactionId: json['linked_transaction_id'] as String,
        linkedWalletId: json['linked_wallet_id'] as String,
        linkedWalletName: json['linked_wallet_name'] as String? ?? '',
        linkedWalletCurrency: json['linked_wallet_currency'] as String?,
        linkedAmount: (json['linked_amount'] as num?)?.toDouble(),
        isOrigin: json['is_origin'] as bool? ?? false,
      );

  final String linkedTransactionId;
  final String linkedWalletId;
  final String linkedWalletName;
  final String? linkedWalletCurrency;
  final double? linkedAmount;
  final bool isOrigin;

  @override
  List<Object?> get props => [
    linkedTransactionId,
    linkedWalletId,
    linkedWalletName,
    linkedWalletCurrency,
    linkedAmount,
    isOrigin,
  ];
}

// ── Infinite-scroll page response ─────────────────────────────────────────

class InfiniteTransactionResponse extends Equatable {
  const InfiniteTransactionResponse({
    required this.data,
    required this.hasMore,
    this.nextCursor,
  });

  factory InfiniteTransactionResponse.fromJson(
    Map<String, dynamic> json,
  ) => InfiniteTransactionResponse(
    data: (json['data'] as List<dynamic>)
        .map((e) => Transaction.fromJson(e as Map<String, dynamic>))
        .toList(),
    hasMore: json['hasMore'] as bool? ?? false,
    nextCursor: json['nextCursor'] as String?,
  );

  final List<Transaction> data;
  final bool hasMore;
  final String? nextCursor;

  @override
  List<Object?> get props => [data, hasMore, nextCursor];
}

List<Transaction> collapseTransferTransactions(
  Iterable<Transaction> transactions,
) {
  final orderedKeys = <String>[];
  final byKey = <String, Transaction>{};

  for (final transaction in transactions) {
    final key = _displayGroupingKey(transaction);
    final existing = byKey[key];
    if (existing == null) {
      orderedKeys.add(key);
      byKey[key] = transaction;
      continue;
    }

    byKey[key] = _preferTransactionForDisplay(existing, transaction);
  }

  return orderedKeys.map((key) => byKey[key]!).toList(growable: false);
}

String _displayGroupingKey(Transaction transaction) {
  final transfer = transaction.transfer;
  if (transfer == null) {
    return transaction.id;
  }

  final ids = [transaction.id, transfer.linkedTransactionId]..sort();
  return 'transfer:${ids.join('::')}';
}

Transaction _preferTransactionForDisplay(
  Transaction existing,
  Transaction candidate,
) {
  final existingIsOrigin = existing.transfer?.isOrigin ?? false;
  final candidateIsOrigin = candidate.transfer?.isOrigin ?? false;

  if (candidateIsOrigin && !existingIsOrigin) {
    return candidate;
  }

  return existing;
}

// ── Transaction ────────────────────────────────────────────────────────────

class Transaction extends Equatable {
  const Transaction({
    required this.id,
    this.amount,
    this.description,
    this.categoryId,
    this.walletId,
    this.takenAt,
    this.createdAt,
    this.categoryName,
    this.categoryIcon,
    this.categoryColor,
    this.walletName,
    this.walletCurrency,
    this.walletIcon,
    this.walletImageSrc,
    this.reportOptIn,
    this.isAmountConfidential,
    this.isDescriptionConfidential,
    this.isCategoryConfidential,
    this.tags = const [],
    this.creatorFullName,
    this.transfer,
  });

  factory Transaction.fromJson(Map<String, dynamic> json) {
    // Handle nested category/wallet from PostgREST join OR flat API response.
    final categoryRaw = json['category'];
    final walletRaw = json['wallet'];
    final category = categoryRaw is Map<String, dynamic> ? categoryRaw : null;
    final wallet = walletRaw is Map<String, dynamic> ? walletRaw : null;

    // Parse tags array.
    final tagsRaw = json['tags'] as List<dynamic>?;
    final tags =
        tagsRaw
            ?.map(
              (t) => TransactionTag.fromJson(t as Map<String, dynamic>),
            )
            .toList() ??
        const <TransactionTag>[];

    // Parse transfer metadata.
    final transferRaw = json['transfer'] as Map<String, dynamic>?;
    final transfer = transferRaw != null
        ? TransactionTransfer.fromJson(transferRaw)
        : null;

    // Parse creator.
    final userRaw = json['user'] as Map<String, dynamic>?;

    return Transaction(
      id: json['id'] as String,
      amount: (json['amount'] as num?)?.toDouble(),
      description: json['description'] as String?,
      categoryId: json['category_id'] as String?,
      walletId: json['wallet_id'] as String?,
      takenAt: json['taken_at'] != null
          ? DateTime.parse(json['taken_at'] as String)
          : null,
      createdAt: json['created_at'] != null
          ? DateTime.parse(json['created_at'] as String)
          : null,
      // category may come as nested object (PostgREST) or flat string (API).
      categoryName:
          category?['name'] as String? ??
          (categoryRaw is String ? categoryRaw : null) ??
          json['category_name'] as String?,
      categoryIcon: json['category_icon'] as String?,
      categoryColor: json['category_color'] as String?,
      // wallet may come as nested object (PostgREST) or flat string (API).
      walletName:
          wallet?['name'] as String? ??
          (walletRaw is String ? walletRaw : null) ??
          json['wallet_name'] as String?,
      walletCurrency:
          wallet?['currency'] as String? ?? json['wallet_currency'] as String?,
      walletIcon:
          wallet?['icon'] as String? ??
          json['wallet_icon'] as String? ??
          json['walletIcon'] as String?,
      walletImageSrc:
          wallet?['image_src'] as String? ??
          json['wallet_image_src'] as String? ??
          json['walletImageSrc'] as String?,
      reportOptIn: json['report_opt_in'] as bool?,
      isAmountConfidential: json['is_amount_confidential'] as bool?,
      isDescriptionConfidential: json['is_description_confidential'] as bool?,
      isCategoryConfidential: json['is_category_confidential'] as bool?,
      tags: tags,
      creatorFullName:
          userRaw?['full_name'] as String? ??
          json['creator_full_name'] as String?,
      transfer: transfer,
    );
  }

  final String id;
  final double? amount;
  final String? description;
  final String? categoryId;
  final String? walletId;
  final DateTime? takenAt;
  final DateTime? createdAt;

  /// Joined from `transaction_categories.name`.
  final String? categoryName;

  /// Emoji / icon identifier for the category.
  final String? categoryIcon;

  /// Hex color for the category (e.g. `#ff0000`).
  final String? categoryColor;

  /// Joined from `workspace_wallets.name`.
  final String? walletName;

  /// Joined from `workspace_wallets.currency`.
  final String? walletCurrency;

  /// Joined from `workspace_wallets.icon`.
  final String? walletIcon;

  /// Joined from `workspace_wallets.image_src`.
  final String? walletImageSrc;

  final bool? reportOptIn;
  final bool? isAmountConfidential;
  final bool? isDescriptionConfidential;
  final bool? isCategoryConfidential;

  /// Tags attached to this transaction.
  final List<TransactionTag> tags;

  /// Full name of the creator.
  final String? creatorFullName;

  /// Transfer metadata (if this is one side of a wallet transfer).
  final TransactionTransfer? transfer;

  bool get isTransfer => transfer != null;

  Map<String, dynamic> toJson() => {
    'id': id,
    'amount': amount,
    'description': description,
    'category_id': categoryId,
    'wallet_id': walletId,
    'taken_at': takenAt?.toIso8601String(),
    'created_at': createdAt?.toIso8601String(),
    'report_opt_in': reportOptIn,
    'is_amount_confidential': isAmountConfidential,
    'is_description_confidential': isDescriptionConfidential,
    'is_category_confidential': isCategoryConfidential,
    'category_name': categoryName,
    'category_icon': categoryIcon,
    'category_color': categoryColor,
    'wallet_name': walletName,
    'wallet_currency': walletCurrency,
    'wallet_icon': walletIcon,
    'wallet_image_src': walletImageSrc,
    'creator_full_name': creatorFullName,
    'tags': tags
        .map(
          (tag) => {
            'id': tag.id,
            'name': tag.name,
            'color': tag.color,
          },
        )
        .toList(),
    'transfer': transfer == null
        ? null
        : {
            'linked_transaction_id': transfer!.linkedTransactionId,
            'linked_wallet_id': transfer!.linkedWalletId,
            'linked_wallet_name': transfer!.linkedWalletName,
            'linked_wallet_currency': transfer!.linkedWalletCurrency,
            'linked_amount': transfer!.linkedAmount,
            'is_origin': transfer!.isOrigin,
          },
  };

  @override
  List<Object?> get props => [
    id,
    amount,
    description,
    categoryId,
    walletId,
    takenAt,
    createdAt,
    categoryName,
    categoryIcon,
    categoryColor,
    walletName,
    walletCurrency,
    walletIcon,
    walletImageSrc,
    reportOptIn,
    isAmountConfidential,
    isDescriptionConfidential,
    isCategoryConfidential,
    tags,
    creatorFullName,
    transfer,
  ];
}
