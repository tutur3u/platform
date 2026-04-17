import 'package:equatable/equatable.dart';

class StoredAuthAccount extends Equatable {
  const StoredAuthAccount({
    required this.id,
    required this.refreshToken,
    required this.lastActiveAt,
    required this.addedAt,
    this.email,
    this.displayName,
    this.avatarUrl,
    this.lastWorkspaceId,
  });

  factory StoredAuthAccount.fromJson(Map<String, dynamic> json) {
    return StoredAuthAccount(
      id: json['id'] as String,
      refreshToken: json['refreshToken'] as String,
      lastActiveAt: json['lastActiveAt'] as int,
      addedAt: json['addedAt'] as int,
      email: json['email'] as String?,
      displayName: json['displayName'] as String?,
      avatarUrl: json['avatarUrl'] as String?,
      lastWorkspaceId: json['lastWorkspaceId'] as String?,
    );
  }

  final String id;
  final String refreshToken;
  final int lastActiveAt;
  final int addedAt;
  final String? email;
  final String? displayName;
  final String? avatarUrl;
  final String? lastWorkspaceId;

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'refreshToken': refreshToken,
      'lastActiveAt': lastActiveAt,
      'addedAt': addedAt,
      'email': email,
      'displayName': displayName,
      'avatarUrl': avatarUrl,
      'lastWorkspaceId': lastWorkspaceId,
    };
  }

  StoredAuthAccount copyWith({
    String? refreshToken,
    int? lastActiveAt,
    int? addedAt,
    Object? email = _sentinel,
    Object? displayName = _sentinel,
    Object? avatarUrl = _sentinel,
    Object? lastWorkspaceId = _sentinel,
  }) {
    return StoredAuthAccount(
      id: id,
      refreshToken: refreshToken ?? this.refreshToken,
      lastActiveAt: lastActiveAt ?? this.lastActiveAt,
      addedAt: addedAt ?? this.addedAt,
      email: email == _sentinel ? this.email : email as String?,
      displayName: displayName == _sentinel
          ? this.displayName
          : displayName as String?,
      avatarUrl: avatarUrl == _sentinel ? this.avatarUrl : avatarUrl as String?,
      lastWorkspaceId: lastWorkspaceId == _sentinel
          ? this.lastWorkspaceId
          : lastWorkspaceId as String?,
    );
  }

  static const Object _sentinel = Object();

  @override
  List<Object?> get props => [
    id,
    refreshToken,
    lastActiveAt,
    addedAt,
    email,
    displayName,
    avatarUrl,
    lastWorkspaceId,
  ];
}
