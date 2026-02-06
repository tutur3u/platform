import 'package:equatable/equatable.dart';

class TimeTrackingCategory extends Equatable {
  const TimeTrackingCategory({
    required this.id,
    this.name,
    this.color,
    this.description,
    this.wsId,
  });

  factory TimeTrackingCategory.fromJson(Map<String, dynamic> json) =>
      TimeTrackingCategory(
        id: json['id'] as String,
        name: json['name'] as String?,
        color: json['color'] as String?,
        description: json['description'] as String?,
        wsId: json['ws_id'] as String?,
      );

  final String id;
  final String? name;
  final String? color;
  final String? description;
  final String? wsId;

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'color': color,
    'description': description,
    'ws_id': wsId,
  };

  @override
  List<Object?> get props => [id, name, color, description, wsId];
}
