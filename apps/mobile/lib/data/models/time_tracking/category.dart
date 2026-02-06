import 'package:equatable/equatable.dart';

class TimeTrackingCategory extends Equatable {
  const TimeTrackingCategory({
    required this.id,
    this.name,
    this.color,
    this.wsId,
  });

  factory TimeTrackingCategory.fromJson(Map<String, dynamic> json) =>
      TimeTrackingCategory(
        id: json['id'] as String,
        name: json['name'] as String?,
        color: json['color'] as String?,
        wsId: json['ws_id'] as String?,
      );

  final String id;
  final String? name;
  final String? color;
  final String? wsId;

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'color': color,
        'ws_id': wsId,
      };

  @override
  List<Object?> get props => [id, name, color, wsId];
}
