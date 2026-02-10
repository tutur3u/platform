import 'package:equatable/equatable.dart';

/// User profile data model.
class UserProfile extends Equatable {
  const UserProfile({
    required this.id,
    this.email,
    this.displayName,
    this.avatarUrl,
    this.fullName,
    this.newEmail,
    this.createdAt,
  });

  factory UserProfile.fromJson(Map<String, dynamic> json) => UserProfile(
    id: json['id'] as String,
    email: json['email'] as String?,
    displayName: json['display_name'] as String?,
    avatarUrl: json['avatar_url'] as String?,
    fullName: json['full_name'] as String?,
    newEmail: json['new_email'] as String?,
    createdAt: json['created_at'] != null
        ? DateTime.parse(json['created_at'] as String)
        : null,
  );

  final String id;
  final String? email;
  final String? displayName;
  final String? avatarUrl;
  final String? fullName;
  final String? newEmail;
  final DateTime? createdAt;

  Map<String, dynamic> toJson() => {
    'id': id,
    'email': email,
    'display_name': displayName,
    'avatar_url': avatarUrl,
    'full_name': fullName,
    'new_email': newEmail,
    'created_at': createdAt?.toIso8601String(),
  };

  UserProfile copyWith({
    String? id,
    String? email,
    String? displayName,
    String? avatarUrl,
    String? fullName,
    String? newEmail,
    DateTime? createdAt,
  }) {
    return UserProfile(
      id: id ?? this.id,
      email: email ?? this.email,
      displayName: displayName ?? this.displayName,
      avatarUrl: avatarUrl ?? this.avatarUrl,
      fullName: fullName ?? this.fullName,
      newEmail: newEmail ?? this.newEmail,
      createdAt: createdAt ?? this.createdAt,
    );
  }

  @override
  List<Object?> get props => [
    id,
    email,
    displayName,
    avatarUrl,
    fullName,
    newEmail,
    createdAt,
  ];
}

/// Response from avatar upload URL request.
class AvatarUploadUrlResponse extends Equatable {
  const AvatarUploadUrlResponse({
    required this.uploadUrl,
    required this.publicUrl,
    required this.filePath,
    required this.token,
  });

  factory AvatarUploadUrlResponse.fromJson(Map<String, dynamic> json) =>
      AvatarUploadUrlResponse(
        uploadUrl: json['uploadUrl'] as String,
        publicUrl: json['publicUrl'] as String,
        filePath: json['filePath'] as String,
        token: json['token'] as String,
      );

  final String uploadUrl;
  final String publicUrl;
  final String filePath;
  final String token;

  @override
  List<Object?> get props => [uploadUrl, publicUrl, filePath, token];
}
