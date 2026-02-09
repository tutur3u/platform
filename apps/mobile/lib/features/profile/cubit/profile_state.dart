import 'package:equatable/equatable.dart';
import 'package:mobile/data/models/user_profile.dart';

enum ProfileStatus { initial, loading, loaded, error }

/// State for profile management.
class ProfileState extends Equatable {
  const ProfileState({
    this.status = ProfileStatus.initial,
    this.profile,
    this.error,
    this.isLoading = false,
  });

  final ProfileStatus status;
  final UserProfile? profile;
  final String? error;
  final bool isLoading;

  ProfileState copyWith({
    ProfileStatus? status,
    UserProfile? profile,
    String? error,
    bool? isLoading,
  }) {
    return ProfileState(
      status: status ?? this.status,
      profile: profile ?? this.profile,
      error: error,
      isLoading: isLoading ?? this.isLoading,
    );
  }

  @override
  List<Object?> get props => [status, profile, error, isLoading];
}
