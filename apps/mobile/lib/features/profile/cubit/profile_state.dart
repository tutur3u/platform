import 'package:equatable/equatable.dart';
import 'package:mobile/data/models/user_profile.dart';

enum ProfileStatus { initial, loading, loaded, error }

const _sentinel = Object();

/// State for profile management.
class ProfileState extends Equatable {
  const ProfileState({
    this.status = ProfileStatus.initial,
    this.profile,
    this.error,
    this.isLoading = false,
    this.isRefreshing = false,
    this.isFromCache = false,
    this.lastUpdatedAt,
  });

  final ProfileStatus status;
  final UserProfile? profile;
  final String? error;
  final bool isLoading;
  final bool isRefreshing;
  final bool isFromCache;
  final DateTime? lastUpdatedAt;

  ProfileState copyWith({
    ProfileStatus? status,
    Object? profile = _sentinel,
    Object? error = _sentinel,
    bool? isLoading,
    bool? isRefreshing,
    bool? isFromCache,
    Object? lastUpdatedAt = _sentinel,
  }) {
    return ProfileState(
      status: status ?? this.status,
      profile: profile == _sentinel ? this.profile : profile as UserProfile?,
      error: error == _sentinel ? this.error : error as String?,
      isLoading: isLoading ?? this.isLoading,
      isRefreshing: isRefreshing ?? this.isRefreshing,
      isFromCache: isFromCache ?? this.isFromCache,
      lastUpdatedAt: lastUpdatedAt == _sentinel
          ? this.lastUpdatedAt
          : lastUpdatedAt as DateTime?,
    );
  }

  @override
  List<Object?> get props => [
    status,
    profile,
    error,
    isLoading,
    isRefreshing,
    isFromCache,
    lastUpdatedAt,
  ];
}
