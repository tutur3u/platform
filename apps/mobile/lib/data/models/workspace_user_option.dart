import 'package:equatable/equatable.dart';

class WorkspaceUserOption extends Equatable {
  const WorkspaceUserOption({
    required this.id,
    required this.displayName,
    this.fullName,
    this.avatarUrl,
  });

  factory WorkspaceUserOption.fromJson(Map<String, dynamic> json) {
    return WorkspaceUserOption(
      id: json['id'] as String,
      displayName:
          (json['display_name'] as String?) ??
          (json['full_name'] as String?) ??
          '',
      fullName: json['full_name'] as String?,
      avatarUrl: json['avatar_url'] as String?,
    );
  }

  final String id;
  final String displayName;
  final String? fullName;
  final String? avatarUrl;

  String get label {
    if (displayName.trim().isNotEmpty) return displayName.trim();
    if (fullName != null && fullName!.trim().isNotEmpty) {
      return fullName!.trim();
    }
    return id;
  }

  @override
  List<Object?> get props => [id, displayName, fullName, avatarUrl];
}
