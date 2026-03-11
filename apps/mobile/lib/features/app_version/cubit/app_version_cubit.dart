import 'package:bloc/bloc.dart';
import 'package:mobile/data/models/mobile_version_check.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/data/repositories/version_check_repository.dart';
import 'package:mobile/features/app_version/cubit/app_version_state.dart';

class AppVersionCubit extends Cubit<AppVersionState> {
  AppVersionCubit({
    required VersionCheckRepository versionCheckRepository,
    required SettingsRepository settingsRepository,
  }) : _versionCheckRepository = versionCheckRepository,
       _settingsRepository = settingsRepository,
       super(const AppVersionState());

  final VersionCheckRepository _versionCheckRepository;
  final SettingsRepository _settingsRepository;

  Future<void> checkVersion({bool background = false}) async {
    final hasCompletedInitialCheck = state.hasCompletedInitialCheck;
    if (!background || !hasCompletedInitialCheck) {
      emit(
        state.copyWith(
          status: AppVersionGateStatus.checking,
          shouldShowRecommendedPrompt: false,
        ),
      );
    }

    try {
      final result = await _versionCheckRepository.checkCurrentVersion();
      if (result == null) {
        emit(
          state.copyWith(
            status: AppVersionGateStatus.supported,
            clearVersionCheck: true,
            hasCompletedInitialCheck: true,
            shouldShowRecommendedPrompt: false,
          ),
        );
        return;
      }

      switch (result.status) {
        case MobileUpdateStatus.updateRequired:
          emit(
            state.copyWith(
              status: AppVersionGateStatus.updateRequired,
              versionCheck: result,
              hasCompletedInitialCheck: true,
              shouldShowRecommendedPrompt: false,
            ),
          );
        case MobileUpdateStatus.updateRecommended:
          final dismissedVersion = await _settingsRepository
              .getDismissedRecommendedVersion(result.platform);
          final shouldPrompt = dismissedVersion != result.effectiveVersion;
          emit(
            state.copyWith(
              status: AppVersionGateStatus.updateRecommended,
              versionCheck: result,
              hasCompletedInitialCheck: true,
              shouldShowRecommendedPrompt: shouldPrompt,
            ),
          );
        case MobileUpdateStatus.supported:
          emit(
            state.copyWith(
              status: AppVersionGateStatus.supported,
              versionCheck: result,
              hasCompletedInitialCheck: true,
              shouldShowRecommendedPrompt: false,
            ),
          );
      }
    } on Exception {
      emit(
        state.copyWith(
          status: AppVersionGateStatus.supported,
          hasCompletedInitialCheck: true,
          shouldShowRecommendedPrompt: false,
        ),
      );
    }
  }

  Future<void> dismissRecommendedPrompt() async {
    final versionCheck = state.versionCheck;
    if (versionCheck == null || versionCheck.effectiveVersion == null) {
      emit(state.copyWith(shouldShowRecommendedPrompt: false));
      return;
    }

    await _settingsRepository.setDismissedRecommendedVersion(
      versionCheck.platform,
      versionCheck.effectiveVersion!,
    );

    emit(state.copyWith(shouldShowRecommendedPrompt: false));
  }
}
