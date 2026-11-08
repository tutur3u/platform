import 'package:equatable/equatable.dart';

const workspaceTierFree = 'FREE';
const workspaceTierPlus = 'PLUS';
const workspaceTierPro = 'PRO';
const workspaceTierEnterprise = 'ENTERPRISE';

String normalizeWorkspaceTier(String? value) {
  switch (value?.trim().toUpperCase()) {
    case workspaceTierPlus:
      return workspaceTierPlus;
    case workspaceTierPro:
      return workspaceTierPro;
    case workspaceTierEnterprise:
      return workspaceTierEnterprise;
    case workspaceTierFree:
    default:
      return workspaceTierFree;
  }
}

class Workspace extends Equatable {
  const Workspace({
    required this.id,
    this.name,
    this.avatarUrl,
    this.personal = false,
    this.deleted = false,
    this.tier = workspaceTierFree,
    this.createdAt,
  });

  factory Workspace.fromJson(Map<String, dynamic> json) => Workspace(
    id: json['id'] as String,
    name: json['name'] as String?,
    avatarUrl: json['avatar_url'] as String?,
    personal: json['personal'] as bool? ?? false,
    deleted: json['deleted'] as bool? ?? false,
    tier: json['tier'] == null
        ? workspaceTierFree
        : normalizeWorkspaceTier(json['tier'] as String?),
    createdAt: json['created_at'] != null
        ? DateTime.parse(json['created_at'] as String)
        : null,
  );

  final String id;
  final String? name;
  final String? avatarUrl;
  final bool personal;
  final bool deleted;
  final String tier;
  final DateTime? createdAt;

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'avatar_url': avatarUrl,
    'personal': personal,
    'deleted': deleted,
    'tier': tier,
    'created_at': createdAt?.toIso8601String(),
  };

  @override
  List<Object?> get props => [
    id,
    name,
    avatarUrl,
    personal,
    deleted,
    tier,
    createdAt,
  ];
}
