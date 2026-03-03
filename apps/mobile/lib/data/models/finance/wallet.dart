import 'package:equatable/equatable.dart';

class Wallet extends Equatable {
  const Wallet({
    required this.id,
    this.name,
    this.description,
    this.balance,
    this.currency,
    this.type,
    this.icon,
    this.imageSrc,
    this.limit,
    this.statementDate,
    this.paymentDate,
    this.reportOptIn,
    this.wsId,
    this.createdAt,
  });

  factory Wallet.fromJson(Map<String, dynamic> json) => Wallet(
    id: json['id'] as String,
    name: json['name'] as String?,
    description: json['description'] as String?,
    balance: (json['balance'] as num?)?.toDouble(),
    currency: json['currency'] as String?,
    type: json['type'] as String?,
    icon: json['icon'] as String?,
    imageSrc: json['image_src'] as String?,
    limit: (json['limit'] as num?)?.toDouble(),
    statementDate: (json['statement_date'] as num?)?.toInt(),
    paymentDate: (json['payment_date'] as num?)?.toInt(),
    reportOptIn: json['report_opt_in'] as bool?,
    wsId: json['ws_id'] as String?,
    createdAt: json['created_at'] != null
        ? DateTime.parse(json['created_at'] as String)
        : null,
  );

  final String id;
  final String? name;
  final String? description;
  final double? balance;
  final String? currency;
  final String? type;
  final String? icon;
  final String? imageSrc;
  final double? limit;
  final int? statementDate;
  final int? paymentDate;
  final bool? reportOptIn;
  final String? wsId;
  final DateTime? createdAt;

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'description': description,
    'balance': balance,
    'currency': currency,
    'type': type,
    'icon': icon,
    'image_src': imageSrc,
    'limit': limit,
    'statement_date': statementDate,
    'payment_date': paymentDate,
    'report_opt_in': reportOptIn,
    'ws_id': wsId,
    'created_at': createdAt?.toIso8601String(),
  };

  @override
  List<Object?> get props => [
    id,
    name,
    description,
    balance,
    currency,
    type,
    icon,
    imageSrc,
    limit,
    statementDate,
    paymentDate,
    reportOptIn,
    wsId,
    createdAt,
  ];
}
