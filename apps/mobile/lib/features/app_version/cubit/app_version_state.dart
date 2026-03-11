import 'package:equatable/equatable.dart';
import 'package:mobile/data/models/mobile_version_check.dart';

enum AppVersionGateStatus {
  initial,
  checking,
  supported,
  updateRecommended,
  updateRequired,
}

class AppVersionState extends Equatable {
  const AppVersionState({
    this.status = AppVersionGateStatus.initial,
    this.versionCheck,
    this.hasCompletedInitialCheck = false,
    this.shouldShowRecommendedPrompt = false,
  });

  final AppVersionGateStatus status;
  final MobileVersionCheck? versionCheck;
  final bool hasCompletedInitialCheck;
  final bool shouldShowRecommendedPrompt;

  AppVersionState copyWith({
    AppVersionGateStatus? status,
    MobileVersionCheck? versionCheck,
    bool clearVersionCheck = false,
    bool? hasCompletedInitialCheck,
    bool? shouldShowRecommendedPrompt,
  }) {
    return AppVersionState(
      status: status ?? this.status,
      versionCheck: clearVersionCheck
          ? null
          : versionCheck ?? this.versionCheck,
      hasCompletedInitialCheck:
          hasCompletedInitialCheck ?? this.hasCompletedInitialCheck,
      shouldShowRecommendedPrompt:
          shouldShowRecommendedPrompt ?? this.shouldShowRecommendedPrompt,
    );
  }

  @override
  List<Object?> get props => [
    status,
    versionCheck,
    hasCompletedInitialCheck,
    shouldShowRecommendedPrompt,
  ];
}
