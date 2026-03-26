import 'package:equatable/equatable.dart';
import 'package:mobile/data/models/user_profile.dart';

const _sentinel = Object();

class ShellProfileState extends Equatable {
  const ShellProfileState({
    this.userId,
    this.profile,
    this.avatarUrl,
    this.avatarIdentityKey,
    this.isRefreshing = false,
    this.isFromCache = false,
    this.lastUpdatedAt,
    this.error,
  });

  final String? userId;
  final UserProfile? profile;
  final String? avatarUrl;
  final String? avatarIdentityKey;
  final bool isRefreshing;
  final bool isFromCache;
  final DateTime? lastUpdatedAt;
  final String? error;

  ShellProfileState copyWith({
    Object? userId = _sentinel,
    Object? profile = _sentinel,
    Object? avatarUrl = _sentinel,
    Object? avatarIdentityKey = _sentinel,
    bool? isRefreshing,
    bool? isFromCache,
    Object? lastUpdatedAt = _sentinel,
    Object? error = _sentinel,
  }) {
    return ShellProfileState(
      userId: userId == _sentinel ? this.userId : userId as String?,
      profile: profile == _sentinel ? this.profile : profile as UserProfile?,
      avatarUrl: avatarUrl == _sentinel ? this.avatarUrl : avatarUrl as String?,
      avatarIdentityKey: avatarIdentityKey == _sentinel
          ? this.avatarIdentityKey
          : avatarIdentityKey as String?,
      isRefreshing: isRefreshing ?? this.isRefreshing,
      isFromCache: isFromCache ?? this.isFromCache,
      lastUpdatedAt: lastUpdatedAt == _sentinel
          ? this.lastUpdatedAt
          : lastUpdatedAt as DateTime?,
      error: error == _sentinel ? this.error : error as String?,
    );
  }

  @override
  List<Object?> get props => [
    userId,
    profile,
    avatarUrl,
    avatarIdentityKey,
    isRefreshing,
    isFromCache,
    lastUpdatedAt,
    error,
  ];
}
