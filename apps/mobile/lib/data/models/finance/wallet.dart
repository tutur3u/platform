import 'package:equatable/equatable.dart';

class Wallet extends Equatable {
  const Wallet({
    required this.id,
    this.name,
    this.balance,
    this.currency,
    this.type,
    this.wsId,
    this.createdAt,
  });

  factory Wallet.fromJson(Map<String, dynamic> json) => Wallet(
    id: json['id'] as String,
    name: json['name'] as String?,
    balance: (json['balance'] as num?)?.toDouble(),
    currency: json['currency'] as String?,
    type: json['type'] as String?,
    wsId: json['ws_id'] as String?,
    createdAt: json['created_at'] != null
        ? DateTime.parse(json['created_at'] as String)
        : null,
  );

  final String id;
  final String? name;
  final double? balance;
  final String? currency;
  final String? type;
  final String? wsId;
  final DateTime? createdAt;

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'balance': balance,
    'currency': currency,
    'type': type,
    'ws_id': wsId,
    'created_at': createdAt?.toIso8601String(),
  };

  @override
  List<Object?> get props => [
    id,
    name,
    balance,
    currency,
    type,
    wsId,
    createdAt,
  ];
}
