import 'package:equatable/equatable.dart';

class FinanceTag extends Equatable {
  const FinanceTag({
    required this.id,
    required this.name,
    this.color,
    this.description,
    this.wsId,
  });

  factory FinanceTag.fromJson(Map<String, dynamic> json) => FinanceTag(
    id: json['id'] as String,
    name: json['name'] as String? ?? '',
    color: json['color'] as String?,
    description: json['description'] as String?,
    wsId: json['ws_id'] as String?,
  );

  final String id;
  final String name;
  final String? color;
  final String? description;
  final String? wsId;

  @override
  List<Object?> get props => [id, name, color, description, wsId];
}
