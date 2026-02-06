import 'package:equatable/equatable.dart';

class Workspace extends Equatable {
  const Workspace({
    required this.id,
    this.name,
    this.avatarUrl,
    this.personal = false,
    this.createdAt,
  });

  factory Workspace.fromJson(Map<String, dynamic> json) => Workspace(
    id: json['id'] as String,
    name: json['name'] as String?,
    avatarUrl: json['avatar_url'] as String?,
    personal: json['personal'] as bool? ?? false,
    createdAt: json['created_at'] != null
        ? DateTime.parse(json['created_at'] as String)
        : null,
  );

  final String id;
  final String? name;
  final String? avatarUrl;
  final bool personal;
  final DateTime? createdAt;

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'avatar_url': avatarUrl,
    'personal': personal,
    'created_at': createdAt?.toIso8601String(),
  };

  @override
  List<Object?> get props => [id, name, avatarUrl, personal, createdAt];
}
