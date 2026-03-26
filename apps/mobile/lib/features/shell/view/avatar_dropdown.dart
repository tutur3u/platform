import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/user_profile.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/profile_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/shell/view/avatar_dropdown_menu.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/widgets/workspace_picker_sheet.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

typedef _ProfileResult = ({UserProfile? profile, String? error});

class _AvatarProfileCache {
  static const Duration _ttl = Duration(minutes: 10);

  static String? _userId;
  static _ProfileResult? _cachedResult;
  static DateTime? _cachedAt;
  static Future<_ProfileResult>? _inFlight;
  static int _requestVersion = 0;

  static Future<_ProfileResult> get({
    required String userId,
    required ProfileRepository repository,
    bool forceRefresh = false,
  }) {
    if (_userId != userId) {
      clear();
      _userId = userId;
    }

    final isFresh =
        _cachedAt != null && DateTime.now().difference(_cachedAt!) < _ttl;

    if (!forceRefresh && isFresh && _cachedResult != null) {
      return Future.value(_cachedResult!);
    }

    if (!forceRefresh && _inFlight != null) {
      return _inFlight!;
    }

    final requestVersion = _requestVersion;
    _inFlight = repository
        .getProfile()
        .then((result) {
          if (requestVersion == _requestVersion) {
            _cachedResult = result;
            _cachedAt = DateTime.now();
          }
          return result;
        })
        .whenComplete(() {
          if (requestVersion == _requestVersion) {
            _inFlight = null;
          }
        });

    return _inFlight!;
  }

  static void clear() {
    _requestVersion++;
    _userId = null;
    _cachedResult = null;
    _cachedAt = null;
    _inFlight = null;
  }
}

class AvatarDropdown extends StatefulWidget {
  const AvatarDropdown({super.key});

  @override
  State<AvatarDropdown> createState() => _AvatarDropdownState();
}

class _AvatarDropdownState extends State<AvatarDropdown> {
  final GlobalKey _triggerKey = GlobalKey(
    debugLabel: 'avatar-dropdown-trigger',
  );

  late final ProfileRepository _profileRepository = ProfileRepository(
    ownsApiClient: true,
    ownsHttpClient: true,
  );

  Future<_ProfileResult>? _profileFuture;
  String? _profileUserId;

  @override
  void dispose() {
    _profileRepository.dispose();
    super.dispose();
  }

  void _ensureProfileLoaded(String? userId) {
    if (userId == null) {
      _profileUserId = null;
      _profileFuture = null;
      return;
    }

    if (_profileUserId == userId && _profileFuture != null) {
      return;
    }
    _profileUserId = userId;
    _profileFuture = _AvatarProfileCache.get(
      userId: userId,
      repository: _profileRepository,
    );
  }

  Future<void> _refreshProfile() async {
    if (_profileUserId == null) {
      return;
    }

    setState(() {
      _profileFuture = _AvatarProfileCache.get(
        userId: _profileUserId!,
        repository: _profileRepository,
        forceRefresh: true,
      );
    });
  }

  Future<void> _openProfilePage(BuildContext context) async {
    await context.push(Routes.profileRoot);
    if (!mounted) {
      return;
    }
    await _refreshProfile();
  }

  Future<void> _handleAction(AvatarMenuAction action) async {
    switch (action) {
      case AvatarMenuAction.workspace:
        showWorkspacePickerSheet(context);
        return;
      case AvatarMenuAction.profile:
        await _openProfilePage(context);
        return;
      case AvatarMenuAction.settings:
        await context.push(Routes.settings);
        return;
      case AvatarMenuAction.logout:
        _AvatarProfileCache.clear();
        await context.read<AuthCubit>().signOut();
        return;
    }
  }

  Future<void> _openMenu(AvatarDropdownMenuData data) async {
    final action = await showAvatarDropdownMenu(
      context: context,
      triggerKey: _triggerKey,
      data: data,
    );
    if (!mounted || action == null) {
      return;
    }
    await _handleAction(action);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final user = context.select<AuthCubit, User?>((cubit) => cubit.state.user);
    _ensureProfileLoaded(user?.id);

    final currentWorkspace = context.select<WorkspaceCubit, Workspace?>(
      (cubit) => cubit.state.currentWorkspace,
    );
    final workspaceName = displayWorkspaceNameOrFallback(
      context,
      currentWorkspace,
    );

    final email = user?.email;
    final meta = user?.userMetadata;
    final fallbackAvatarUrl = _nonEmpty(meta?['avatar_url'] as String?);
    final fallbackFullName = _nonEmpty(meta?['full_name'] as String?);
    final fallbackDisplayName = _nonEmpty(meta?['display_name'] as String?);

    return FutureBuilder<_ProfileResult>(
      future: _profileFuture,
      builder: (context, snapshot) {
        final loadError = snapshot.hasError
            ? snapshot.error
            : snapshot.data?.error;
        if (loadError != null) {
          debugPrint('AvatarDropdown profile load failed: $loadError');
        }

        final profile = snapshot.data?.profile;
        final avatarUrl = _nonEmpty(profile?.avatarUrl) ?? fallbackAvatarUrl;
        final fullName = _nonEmpty(profile?.fullName) ?? fallbackFullName;
        final displayName =
            _nonEmpty(profile?.displayName) ?? fallbackDisplayName;
        final name = fullName ?? displayName ?? email ?? l10n.settingsProfile;

        final data = AvatarDropdownMenuData(
          name: name,
          email: email,
          avatarUrl: avatarUrl,
          workspaceName: workspaceName,
          currentWorkspace: currentWorkspace,
        );

        return AvatarDropdownTrigger(
          triggerKey: _triggerKey,
          data: data,
          onPressed: () => unawaited(_openMenu(data)),
        );
      },
    );
  }

  String? _nonEmpty(String? value) {
    if (value == null || value.isEmpty) {
      return null;
    }
    return value;
  }
}
