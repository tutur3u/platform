import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Card, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/user_profile.dart';
import 'package:mobile/data/repositories/profile_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/workspace/widgets/workspace_picker_sheet.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:supabase_flutter/supabase_flutter.dart'; // For User type

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

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);

    // Explicit generic type to avoid type annotation on closure parameter
    final user = context.select<AuthCubit, User?>((cubit) => cubit.state.user);
    _ensureProfileLoaded(user?.id);

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
        final name = fullName ?? displayName ?? email;

        return PopupMenuButton<String>(
          offset: const Offset(0, 48),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8),
            side: BorderSide(color: theme.colorScheme.border),
          ),
          color: theme.colorScheme.popover,
          itemBuilder: (context) => [
            PopupMenuItem<String>(
              value: 'workspace',
              child: Row(
                children: [
                  Icon(
                    Icons.swap_horiz,
                    size: 16,
                    color: theme.colorScheme.popoverForeground,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    l10n.workspacePickerTitle,
                    style: theme.typography.p.copyWith(
                      color: theme.colorScheme.popoverForeground,
                    ),
                  ),
                ],
              ),
            ),
            const PopupMenuDivider(),
            PopupMenuItem<String>(
              value: 'profile',
              child: Row(
                children: [
                  Icon(
                    Icons.person_outline,
                    size: 16,
                    color: theme.colorScheme.popoverForeground,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    l10n.settingsProfile,
                    style: theme.typography.p.copyWith(
                      color: theme.colorScheme.popoverForeground,
                    ),
                  ),
                ],
              ),
            ),
            PopupMenuItem<String>(
              value: 'settings',
              child: Row(
                children: [
                  Icon(
                    Icons.settings_outlined,
                    size: 16,
                    color: theme.colorScheme.popoverForeground,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    l10n.settingsTitle,
                    style: theme.typography.p.copyWith(
                      color: theme.colorScheme.popoverForeground,
                    ),
                  ),
                ],
              ),
            ),
            const PopupMenuDivider(),
            PopupMenuItem<String>(
              value: 'logout',
              child: Row(
                children: [
                  Icon(
                    Icons.logout,
                    size: 16,
                    color: theme.colorScheme.destructive,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    l10n.authLogOut,
                    style: theme.typography.p.copyWith(
                      color: theme.colorScheme.destructive,
                    ),
                  ),
                ],
              ),
            ),
          ],
          onSelected: (value) {
            switch (value) {
              case 'workspace':
                showWorkspacePickerSheet(context);
              case 'profile':
                unawaited(_openProfilePage(context));
              case 'settings':
                unawaited(context.push(Routes.settings));
              case 'logout':
                _AvatarProfileCache.clear();
                final authCubit = context.read<AuthCubit>();
                unawaited(authCubit.signOut());
            }
          },
          child: CircleAvatar(
            radius: 16,
            foregroundImage: avatarUrl != null ? NetworkImage(avatarUrl) : null,
            onForegroundImageError: avatarUrl != null
                ? (_, _) => debugPrint(
                    'AvatarDropdown avatar image failed to load: $avatarUrl',
                  )
                : null,
            backgroundColor: theme.colorScheme.muted,
            child: Text(
              _getInitials(name),
              style: theme.typography.large.copyWith(
                color: theme.colorScheme.foreground,
              ),
            ),
          ),
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

  String _getInitials(String? name) {
    if (name == null || name.isEmpty) return 'U';
    return name.substring(0, 1).toUpperCase();
  }
}
