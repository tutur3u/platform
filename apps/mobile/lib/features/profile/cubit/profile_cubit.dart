import 'dart:io';

import 'package:bloc/bloc.dart';
import 'package:mobile/data/repositories/profile_repository.dart';
import 'package:mobile/features/profile/cubit/profile_state.dart';

/// Cubit for managing user profile state.
class ProfileCubit extends Cubit<ProfileState> {
  ProfileCubit({required ProfileRepository profileRepository})
    : _repository = profileRepository,
      super(const ProfileState());

  final ProfileRepository _repository;

  /// Loads the user's profile.
  Future<void> loadProfile() async {
    emit(state.copyWith(status: ProfileStatus.loading));

    final result = await _repository.getProfile();

    if (result.profile != null) {
      emit(
        state.copyWith(
          status: ProfileStatus.loaded,
          profile: result.profile,
          error: null,
        ),
      );
    } else {
      emit(
        state.copyWith(
          status: ProfileStatus.error,
          error: result.error,
        ),
      );
    }
  }

  /// Updates display name.
  Future<bool> updateDisplayName(String displayName) async {
    emit(state.copyWith(isLoading: true));

    final result = await _repository.updateDisplayName(displayName);

    if (result.success) {
      // Reload profile to get updated data
      await loadProfile();
      emit(state.copyWith(isLoading: false));
      return true;
    } else {
      emit(state.copyWith(isLoading: false, error: result.error));
      return false;
    }
  }

  /// Updates full name.
  Future<bool> updateFullName(String fullName) async {
    emit(state.copyWith(isLoading: true));

    final result = await _repository.updateFullName(fullName);

    if (result.success) {
      // Reload profile to get updated data
      await loadProfile();
      emit(state.copyWith(isLoading: false));
      return true;
    } else {
      emit(state.copyWith(isLoading: false, error: result.error));
      return false;
    }
  }

  /// Updates email.
  Future<bool> updateEmail(String email) async {
    emit(state.copyWith(isLoading: true));

    final result = await _repository.updateEmail(email);

    if (result.success) {
      // Reload profile to get updated data
      await loadProfile();
      emit(state.copyWith(isLoading: false));
      return true;
    } else {
      emit(state.copyWith(isLoading: false, error: result.error));
      return false;
    }
  }

  /// Uploads avatar.
  Future<bool> uploadAvatar(File file) async {
    emit(state.copyWith(isLoading: true));

    // Get upload URL
    final urlResult = await _repository.getAvatarUploadUrl(file.path);

    if (urlResult.response == null) {
      emit(state.copyWith(isLoading: false, error: urlResult.error));
      return false;
    }

    // Upload file
    final uploadResult = await _repository.uploadAvatarFile(
      urlResult.response!.uploadUrl,
      file,
    );

    if (!uploadResult.success) {
      emit(state.copyWith(isLoading: false, error: uploadResult.error));
      return false;
    }

    // Update avatar URL
    final updateResult = await _repository.updateAvatarUrl(
      urlResult.response!.publicUrl,
    );

    if (updateResult.success) {
      // Reload profile to get updated data
      await loadProfile();
      emit(state.copyWith(isLoading: false));
      return true;
    } else {
      emit(state.copyWith(isLoading: false, error: updateResult.error));
      return false;
    }
  }

  /// Removes avatar.
  Future<bool> removeAvatar() async {
    emit(state.copyWith(isLoading: true));

    final result = await _repository.removeAvatar();

    if (result.success) {
      // Reload profile to get updated data
      await loadProfile();
      emit(state.copyWith(isLoading: false));
      return true;
    } else {
      emit(state.copyWith(isLoading: false, error: result.error));
      return false;
    }
  }

  void clearError() => emit(state.copyWith(error: null));

  @override
  Future<void> close() {
    _repository.dispose();
    return super.close();
  }
}
