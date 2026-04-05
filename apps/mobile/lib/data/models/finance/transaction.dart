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
    this.isSynthetic = false,
  });

  factory TransactionTransfer.fromJson(Map<String, dynamic> json) =>
      TransactionTransfer(
        linkedTransactionId: json['linked_transaction_id'] as String,
        linkedWalletId: json['linked_wallet_id'] as String,
        linkedWalletName: json['linked_wallet_name'] as String? ?? '',
        linkedWalletCurrency: json['linked_wallet_currency'] as String?,
        linkedAmount: (json['linked_amount'] as num?)?.toDouble(),
        isOrigin: json['is_origin'] as bool? ?? false,
        isSynthetic: json['is_synthetic'] as bool? ?? false,
      );

  TransactionTransfer copyWith({
    String? linkedTransactionId,
    String? linkedWalletId,
    String? linkedWalletName,
    String? linkedWalletCurrency,
    double? linkedAmount,
    bool? isOrigin,
    bool? isSynthetic,
  }) => TransactionTransfer(
    linkedTransactionId: linkedTransactionId ?? this.linkedTransactionId,
    linkedWalletId: linkedWalletId ?? this.linkedWalletId,
    linkedWalletName: linkedWalletName ?? this.linkedWalletName,
    linkedWalletCurrency: linkedWalletCurrency ?? this.linkedWalletCurrency,
    linkedAmount: linkedAmount ?? this.linkedAmount,
    isOrigin: isOrigin ?? this.isOrigin,
    isSynthetic: isSynthetic ?? this.isSynthetic,
  );

  final String linkedTransactionId;
  final String linkedWalletId;
  final String linkedWalletName;
  final String? linkedWalletCurrency;
  final double? linkedAmount;
  final bool isOrigin;
  final bool isSynthetic;

  @override
  List<Object?> get props => [
    linkedTransactionId,
    linkedWalletId,
    linkedWalletName,
    linkedWalletCurrency,
    linkedAmount,
    isOrigin,
    isSynthetic,
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
  final orderedTransactions = transactions.toList(growable: false);
  final emittedTransferKeys = <String>{};
  final handledTransactionIds = <String>{};
  final preferredTransferByKey = <String, Transaction>{};
  final collapsed = <Transaction>[];

  for (final transaction in orderedTransactions) {
    final transfer = transaction.transfer;
    if (transfer == null) {
      continue;
    }

    final key = _displayGroupingKey(transaction);
    final existing = preferredTransferByKey[key];
    preferredTransferByKey[key] = existing == null
        ? transaction
        : _preferTransactionForDisplay(existing, transaction);
  }

  for (final transaction in orderedTransactions) {
    if (handledTransactionIds.contains(transaction.id)) {
      continue;
    }

    final transfer = transaction.transfer;
    if (transfer != null) {
      final key = _displayGroupingKey(transaction);
      if (emittedTransferKeys.add(key)) {
        collapsed.add(preferredTransferByKey[key]!);
      }
      handledTransactionIds
        ..add(transaction.id)
        ..add(transfer.linkedTransactionId);
      continue;
    }

    final heuristicPair = _findHeuristicTransferPair(
      transaction,
      orderedTransactions,
      handledTransactionIds,
    );
    if (heuristicPair != null) {
      handledTransactionIds
        ..add(transaction.id)
        ..add(heuristicPair.id);
      collapsed.add(
        _buildSyntheticTransferTransaction(transaction, heuristicPair),
      );
      continue;
    }

    handledTransactionIds.add(transaction.id);
    collapsed.add(transaction);
  }

  return collapsed;
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

Transaction? _findHeuristicTransferPair(
  Transaction transaction,
  List<Transaction> transactions,
  Set<String> handledTransactionIds,
) {
  for (final candidate in transactions) {
    if (candidate.id == transaction.id ||
        handledTransactionIds.contains(candidate.id)) {
      continue;
    }

    if (_looksLikeTransferPair(transaction, candidate)) {
      return candidate;
    }
  }

  return null;
}

bool _looksLikeTransferPair(Transaction a, Transaction b) {
  if (a.transfer != null || b.transfer != null) {
    return false;
  }
  if (a.reportOptIn != false || b.reportOptIn != false) {
    return false;
  }
  if (a.walletId == null ||
      b.walletId == null ||
      a.walletId == b.walletId ||
      a.amount == null ||
      b.amount == null ||
      a.amount == 0 ||
      b.amount == 0) {
    return false;
  }
  if (a.amount!.isNegative == b.amount!.isNegative) {
    return false;
  }
  if ((a.amount!.abs() - b.amount!.abs()).abs() > 0.000001) {
    return false;
  }

  final aTimestamp = (a.takenAt ?? a.createdAt)?.toUtc();
  final bTimestamp = (b.takenAt ?? b.createdAt)?.toUtc();
  if (aTimestamp == null || bTimestamp == null) {
    return false;
  }
  if (!aTimestamp.isAtSameMomentAs(bTimestamp)) {
    return false;
  }

  final aDescription = a.description?.trim().toLowerCase() ?? '';
  final bDescription = b.description?.trim().toLowerCase() ?? '';
  return aDescription == bDescription;
}

Transaction _buildSyntheticTransferTransaction(
  Transaction first,
  Transaction second,
) {
  final origin =
      (first.amount ?? 0).isNegative || !(second.amount ?? 0).isNegative
      ? first
      : second;
  final destination = identical(origin, first) ? second : first;

  return Transaction(
    id: origin.id,
    amount: origin.amount,
    description: (origin.description?.trim().isNotEmpty ?? false)
        ? origin.description
        : destination.description,
    walletId: origin.walletId,
    takenAt: origin.takenAt ?? destination.takenAt,
    createdAt: origin.createdAt ?? destination.createdAt,
    walletName: origin.walletName,
    walletCurrency: origin.walletCurrency,
    walletIcon: origin.walletIcon,
    walletImageSrc: origin.walletImageSrc,
    reportOptIn: false,
    isAmountConfidential:
        origin.isAmountConfidential ?? destination.isAmountConfidential,
    isDescriptionConfidential:
        origin.isDescriptionConfidential ??
        destination.isDescriptionConfidential,
    isCategoryConfidential: false,
    tags: _mergeTransactionTags(origin.tags, destination.tags),
    creatorFullName: origin.creatorFullName ?? destination.creatorFullName,
    transfer: TransactionTransfer(
      linkedTransactionId: destination.id,
      linkedWalletId: destination.walletId ?? '',
      linkedWalletName: destination.walletName ?? '',
      linkedWalletCurrency: destination.walletCurrency,
      linkedAmount: destination.amount?.abs(),
      isOrigin: true,
      isSynthetic: true,
    ),
  );
}

List<TransactionTag> _mergeTransactionTags(
  List<TransactionTag> first,
  List<TransactionTag> second,
) {
  final tagsById = <String, TransactionTag>{};

  for (final tag in [...first, ...second]) {
    tagsById[tag.id] = tag;
  }

  return tagsById.values.toList(growable: false);
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

  Transaction copyWith({
    String? id,
    double? amount,
    String? description,
    String? categoryId,
    String? walletId,
    DateTime? takenAt,
    DateTime? createdAt,
    String? categoryName,
    String? categoryIcon,
    String? categoryColor,
    String? walletName,
    String? walletCurrency,
    String? walletIcon,
    String? walletImageSrc,
    bool? reportOptIn,
    bool? isAmountConfidential,
    bool? isDescriptionConfidential,
    bool? isCategoryConfidential,
    List<TransactionTag>? tags,
    String? creatorFullName,
    TransactionTransfer? transfer,
  }) => Transaction(
    id: id ?? this.id,
    amount: amount ?? this.amount,
    description: description ?? this.description,
    categoryId: categoryId ?? this.categoryId,
    walletId: walletId ?? this.walletId,
    takenAt: takenAt ?? this.takenAt,
    createdAt: createdAt ?? this.createdAt,
    categoryName: categoryName ?? this.categoryName,
    categoryIcon: categoryIcon ?? this.categoryIcon,
    categoryColor: categoryColor ?? this.categoryColor,
    walletName: walletName ?? this.walletName,
    walletCurrency: walletCurrency ?? this.walletCurrency,
    walletIcon: walletIcon ?? this.walletIcon,
    walletImageSrc: walletImageSrc ?? this.walletImageSrc,
    reportOptIn: reportOptIn ?? this.reportOptIn,
    isAmountConfidential: isAmountConfidential ?? this.isAmountConfidential,
    isDescriptionConfidential:
        isDescriptionConfidential ?? this.isDescriptionConfidential,
    isCategoryConfidential:
        isCategoryConfidential ?? this.isCategoryConfidential,
    tags: tags ?? this.tags,
    creatorFullName: creatorFullName ?? this.creatorFullName,
    transfer: transfer ?? this.transfer,
  );

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
            'is_synthetic': transfer!.isSynthetic,
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
