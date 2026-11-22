import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/onboarding/data/onboarding_services.dart';
import 'package:mobile/features/onboarding/widgets/onboarding_profile_step.dart';
import 'package:mobile/features/settings/cubit/locale_cubit.dart';
import 'package:mobile/features/settings/cubit/theme_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/features/shell/view/account_presentation.dart';
import 'package:mobile/l10n/l10n.dart';

String? _text(Object? value) =>
    value is String && value.trim().isNotEmpty ? value.trim() : null;

/// Step 1 state: the display name, photo, language and appearance. Each
/// choice writes through the existing setting or profile API.
mixin OnboardingProfileController<T extends StatefulWidget> on State<T> {
  OnboardingServices get services;

  final nameController = TextEditingController();
  String? _savedName;
  String? _failedName;
  String? _nameError;
  String? _photoError;
  var _photoBusy = false;
  ThemeMode? _themeMode;

  /// The currently signed-in account; null once it is signed out. Callers
  /// capture it before any await, and the router closes the flow on a switch.
  String? get userId => context.read<AuthCubit>().state.user?.id;

  /// The name to greet with: the field, else the saved profile name.
  String? get displayName => _text(nameController.text) ?? _savedName;

  void initProfile() {
    final user = context.read<AuthCubit>().state.user;
    final shell = context.read<ShellProfileCubit?>()?.state;
    final profile = shell?.userId == user?.id ? shell?.profile : null;
    _savedName =
        _text(profile?.displayName) ??
        _text(profile?.fullName) ??
        _text(user?.userMetadata?['display_name']) ??
        _text(user?.userMetadata?['full_name']);
    nameController.text = _savedName ?? '';
  }

  void disposeProfile() => nameController.dispose();

  /// Saves a changed name; true when the step may advance. A failed save
  /// shows once, and the next Continue moves on without it.
  Future<bool> saveProfileName() async {
    final name = _text(nameController.text);
    final user = userId;
    if (name == null || name == _savedName || user == null) return true;
    if (name == _failedName) return true;
    final saved = await services.saveDisplayName(user, name);
    if (!mounted) return false;
    if (saved) {
      _savedName = name;
      _refreshShellProfile();
      setState(() => _nameError = null);
      return true;
    }
    setState(() {
      _failedName = name;
      _nameError = context.l10n.onboardingDisplayNameFailed;
    });
    return false;
  }

  void _refreshShellProfile() {
    final user = context.read<AuthCubit>().state.user;
    unawaited(context.read<ShellProfileCubit?>()?.refreshIfStale(user));
  }

  Future<void> _changePhoto() async {
    final user = userId;
    if (user == null || _photoBusy) return;
    setState(() {
      _photoBusy = true;
      _photoError = null;
    });
    final changed = await services.changeAvatar(context, user);
    if (!mounted) return;
    if (changed ?? false) _refreshShellProfile();
    setState(() {
      _photoBusy = false;
      // A cancelled pick says nothing.
      _photoError = changed == false
          ? context.l10n.onboardingPhotoFailed
          : null;
    });
  }

  void _setLanguage(String code) {
    unawaited(context.read<LocaleCubit?>()?.setLocale(Locale(code)));
  }

  void _setTheme(ThemeMode mode) {
    setState(() => _themeMode = mode);
    final cubit = context.read<ThemeCubit?>();
    unawaited(cubit?.setThemeMode(ThemeCubit.parseThemeMode(mode.name)));
  }

  Widget buildProfileStep(BuildContext context) {
    final auth = context.read<AuthCubit>().state;
    final shell = context.watch<ShellProfileCubit?>()?.state;
    final identity =
        activeAccountIdentity(
          auth,
          profile: shell?.profile,
          avatarUrl: shell?.avatarUrl,
        ) ??
        (id: '', name: '?', email: null, url: null);
    final themeName = context.read<ThemeCubit?>()?.state.themeMode.name;
    return OnboardingProfileStep(
      identity: (
        id: identity.id,
        name: displayName ?? identity.name,
        email: identity.email,
        url: identity.url,
      ),
      nameController: nameController,
      languageCode: Localizations.localeOf(context).languageCode,
      onLanguage: _setLanguage,
      themeMode:
          _themeMode ??
          ThemeMode.values.asNameMap()[themeName] ??
          ThemeMode.system,
      onTheme: _setTheme,
      // No user-level product email preference exists yet; see
      // apps/docs/platform/features/mobile-onboarding.mdx.
      productNews: false,
      onChangePhoto: () => unawaited(_changePhoto()),
      photoBusy: _photoBusy,
      photoError: _photoError,
      nameError: _nameError,
    );
  }
}
