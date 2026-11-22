import 'dart:developer';

import 'package:flutter/widgets.dart';
import 'package:mobile/data/repositories/notifications_repository.dart';
import 'package:mobile/data/repositories/profile_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/profile/view/profile_avatar_picker.dart';

/// A workspace invite the account has not answered yet.
@immutable
class OnboardingInvite {
  const OnboardingInvite({
    required this.workspaceId,
    required this.workspaceName,
    this.inviterName,
    this.notificationId,
  });

  final String workspaceId;
  final String workspaceName;
  final String? inviterName;
  final String? notificationId;
}

/// The existing APIs onboarding writes through. Every call is pinned to the
/// account that started it, so a switch mid-request fails instead of
/// writing to the other account.
abstract interface class OnboardingServices {
  Future<bool> saveDisplayName(String userId, String displayName);

  /// Picks, crops and uploads a new avatar: true when changed, false when
  /// the upload failed and null when the person cancelled.
  Future<bool?> changeAvatar(BuildContext context, String userId);

  /// The newest unanswered workspace invite, if any.
  Future<OnboardingInvite?> pendingInvite(String userId);

  Future<void> acceptInvite(String userId, OnboardingInvite invite);

  /// Mirrors the choices to the web onboarding progress. Best effort.
  Future<void> syncGoals(String userId, List<String> goals);
}

class DefaultOnboardingServices implements OnboardingServices {
  DefaultOnboardingServices({
    ProfileRepository? profiles,
    NotificationsRepository? notifications,
    ApiClient? api,
    ProfileAvatarPicker avatarPicker = const ProfileAvatarPicker(),
  }) : _profiles = profiles ?? ProfileRepository(),
       _notifications = notifications ?? NotificationsRepository(),
       _api = api ?? ApiClient(),
       _avatarPicker = avatarPicker;

  static const progressPath = '/api/v1/user/onboarding-progress';

  final ProfileRepository _profiles;
  final NotificationsRepository _notifications;
  final ApiClient _api;
  final ProfileAvatarPicker _avatarPicker;

  @override
  Future<bool> saveDisplayName(String userId, String displayName) async {
    final result = await ApiClient.runForUser(
      userId,
      () => _profiles.updateDisplayName(displayName),
    );
    return result.success;
  }

  @override
  Future<bool?> changeAvatar(BuildContext context, String userId) async {
    try {
      final source = await _avatarPicker.chooseSource(context);
      if (source == null) return null;
      final picked = await _avatarPicker.pickImage(source);
      if (picked == null || !context.mounted) return null;
      final cropped = await _avatarPicker.cropImage(context, picked);
      if (cropped == null) return null;
      final result = await ApiClient.runForUser(
        userId,
        () => _profiles.saveAvatarResult(cropped),
      );
      return result.success;
    } on Object catch (error) {
      log('Onboarding avatar not changed: ${error.runtimeType}');
      return false;
    }
  }

  @override
  Future<OnboardingInvite?> pendingInvite(String userId) async {
    final page = await ApiClient.runForUser(
      userId,
      _notifications.fetchNotifications,
    );
    for (final item in page.notifications) {
      final wsId = item.workspaceId;
      if (item.type != 'workspace_invite' ||
          item.actionTaken != null ||
          wsId == null) {
        continue;
      }
      return OnboardingInvite(
        workspaceId: wsId,
        workspaceName: item.workspaceName ?? item.title,
        inviterName: item.actor?.displayName,
        notificationId: item.id,
      );
    }
    return null;
  }

  @override
  Future<void> acceptInvite(String userId, OnboardingInvite invite) =>
      ApiClient.runForUser(userId, () async {
        await _notifications.acceptWorkspaceInvite(invite.workspaceId);
        final id = invite.notificationId;
        if (id == null) return;
        // Same record the notification inbox keeps after Accept.
        await _notifications.updateMetadata(
          id: id,
          metadata: {
            'action_taken': 'accepted',
            'action_timestamp': DateTime.now().toUtc().toIso8601String(),
          },
        );
      });

  @override
  Future<void> syncGoals(String userId, List<String> goals) async {
    try {
      await ApiClient.runForUser(
        userId,
        () => _api.patchJson(progressPath, {'goals': goals}),
      );
    } on Object catch (error) {
      log('Onboarding goals not synced: ${error.runtimeType}');
    }
  }
}
