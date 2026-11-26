import 'package:equatable/equatable.dart';

/// What a person invited to a task or board may do there.
enum SharePermission {
  view,
  edit;

  static SharePermission parse(Object? value) =>
      value == 'edit' ? SharePermission.edit : SharePermission.view;
}

String? _text(Object? value) {
  final text = value is String ? value.trim() : '';
  return text.isEmpty ? null : text;
}

Map<String, dynamic> _map(Object? value) =>
    value is Map ? Map<String, dynamic>.from(value) : const {};

/// Someone a task or board is shared with: a user, or an email invite that
/// has no account yet.
class ShareGrant extends Equatable {
  const ShareGrant({
    required this.id,
    required this.permission,
    this.email,
    this.displayName,
    this.handle,
  });

  /// Task shares nest the person under `users` with `shared_with_email`.
  factory ShareGrant.fromTaskJson(Map<String, dynamic> json) {
    final user = _map(json['users']);
    return ShareGrant(
      id: json['id']?.toString() ?? '',
      permission: SharePermission.parse(json['permission']),
      email: _text(json['shared_with_email']),
      displayName: _text(user['display_name']),
      handle: _text(user['handle']),
    );
  }

  /// Board shares nest the person under `user` with `email`.
  factory ShareGrant.fromBoardJson(Map<String, dynamic> json) {
    final user = _map(json['user']);
    return ShareGrant(
      id: json['id']?.toString() ?? '',
      permission: SharePermission.parse(json['permission']),
      email: _text(json['email']),
      displayName: _text(user['display_name']),
      handle: _text(user['handle']),
    );
  }

  final String id;
  final SharePermission permission;
  final String? email;
  final String? displayName;
  final String? handle;

  /// The name web shows: display name, handle, then email.
  String get label => displayName ?? handle ?? email ?? '';

  /// An email invite rather than a member account.
  bool get isEmailInvite => displayName == null && handle == null;

  @override
  List<Object?> get props => [id, permission, email, displayName, handle];
}

/// A task's single share link.
class TaskShareLink extends Equatable {
  const TaskShareLink({
    required this.id,
    required this.code,
    this.publicAccess = false,
    this.requiresInvite = false,
  });

  factory TaskShareLink.fromJson(Map<String, dynamic> json) => TaskShareLink(
    id: json['id']?.toString() ?? '',
    code: json['code']?.toString() ?? '',
    publicAccess: json['public_access'] == 'view',
    requiresInvite: json['requires_invite'] == true,
  );

  final String id;
  final String code;

  /// Anyone with the link can view.
  final bool publicAccess;

  /// Only invited people can open the link.
  final bool requiresInvite;

  @override
  List<Object?> get props => [id, code, publicAccess, requiresInvite];
}

/// A board's public read-only link, when enabled.
class BoardPublicLink extends Equatable {
  const BoardPublicLink({required this.id, required this.code});

  factory BoardPublicLink.fromJson(Map<String, dynamic> json) =>
      BoardPublicLink(
        id: json['id']?.toString() ?? '',
        code: json['code']?.toString() ?? '',
      );

  final String id;
  final String code;

  @override
  List<Object?> get props => [id, code];
}
