import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart' hide AppBar, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:image_cropper/image_cropper.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/data/models/user_profile.dart';
import 'package:mobile/data/repositories/profile_repository.dart';
import 'package:mobile/features/profile/cubit/profile_cubit.dart';
import 'package:mobile/features/profile/cubit/profile_state.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';
import 'package:mobile/widgets/image_source_picker_dialog.dart';
import 'package:mobile/widgets/staggered_entry.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class ProfilePage extends StatelessWidget {
  const ProfilePage({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) {
        final cubit = ProfileCubit(
          profileRepository: ProfileRepository(
            ownsApiClient: true,
            ownsHttpClient: true,
          ),
        );
        unawaited(cubit.loadProfile());
        return cubit;
      },
      child: const _ProfileView(),
    );
  }
}

class _ProfileView extends StatelessWidget {
  const _ProfileView();

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return BlocListener<ProfileCubit, ProfileState>(
      listenWhen: (previous, current) =>
          previous.profile != current.profile ||
          previous.lastUpdatedAt != current.lastUpdatedAt,
      listener: (context, state) {
        final profile = state.profile;
        if (profile == null) {
          return;
        }
        unawaited(
          context.read<ShellProfileCubit>().applyExternalProfile(
            profile,
            lastUpdatedAt: state.lastUpdatedAt,
            isFromCache: state.isFromCache,
          ),
        );
      },
      child: shad.Scaffold(
        child: BlocBuilder<ProfileCubit, ProfileState>(
          builder: (context, state) {
            if (state.status == ProfileStatus.loading &&
                state.profile == null) {
              return Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const shad.CircularProgressIndicator(),
                    const shad.Gap(16),
                    Text(l10n.profileLoading),
                  ],
                ),
              );
            }

            if (state.status == ProfileStatus.error && state.profile == null) {
              return Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        state.error ?? l10n.profileUpdateError,
                        textAlign: TextAlign.center,
                      ),
                      const shad.Gap(16),
                      shad.PrimaryButton(
                        onPressed: () =>
                            context.read<ProfileCubit>().loadProfile(
                              forceRefresh: true,
                            ),
                        child: Text(l10n.commonRetry),
                      ),
                    ],
                  ),
                ),
              );
            }

            final profile = state.profile;
            if (profile == null) {
              return const SizedBox.shrink();
            }

            return RefreshIndicator.adaptive(
              onRefresh: () => context.read<ProfileCubit>().loadProfile(
                forceRefresh: true,
              ),
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(
                  parent: BouncingScrollPhysics(),
                ),
                padding: const EdgeInsets.fromLTRB(16, 20, 16, 28),
                children: [
                  StaggeredEntry(
                    index: 0,
                    playOnceKey: 'profile-hero',
                    child: _ProfileHeroCard(profile: profile, state: state),
                  ),
                  const shad.Gap(32),
                  StaggeredEntry(
                    index: 1,
                    playOnceKey: 'profile-identity',
                    child: _ProfilePanel(
                      title: l10n.profileIdentitySectionTitle,
                      description: l10n.profileIdentitySectionDescription,
                      child: Column(
                        children: [
                          _ProfileActionTile(
                            icon: Icons.person_outline_rounded,
                            title: l10n.profileDisplayName,
                            value:
                                profile.displayName ?? l10n.profileMissingValue,
                            isValuePlaceholder:
                                profile.displayName?.trim().isEmpty ?? true,
                            onTap: () => _showEditFieldSheet(
                              context,
                              title: l10n.profileDisplayName,
                              description: l10n.profileDisplayNameDescription,
                              initialValue: profile.displayName ?? '',
                              placeholder: l10n.profileDisplayNameHint,
                              validator: (value) => value.trim().isEmpty
                                  ? l10n.profileDisplayNameRequired
                                  : null,
                              onSave: (value) => context
                                  .read<ProfileCubit>()
                                  .updateDisplayName(value),
                            ),
                          ),
                          const shad.Gap(12),
                          _ProfileActionTile(
                            icon: Icons.badge_outlined,
                            title: l10n.profileFullName,
                            value: profile.fullName ?? l10n.profileMissingValue,
                            isValuePlaceholder:
                                profile.fullName?.trim().isEmpty ?? true,
                            onTap: () => _showEditFieldSheet(
                              context,
                              title: l10n.profileFullName,
                              description: l10n.profileFullNameDescription,
                              initialValue: profile.fullName ?? '',
                              placeholder: l10n.profileFullNameHint,
                              validator: (value) => value.trim().isEmpty
                                  ? l10n.profileFullNameRequired
                                  : null,
                              onSave: (value) => context
                                  .read<ProfileCubit>()
                                  .updateFullName(value),
                            ),
                          ),
                          const shad.Gap(12),
                          _ProfileActionTile(
                            icon: Icons.alternate_email_rounded,
                            title: l10n.profileEmail,
                            value: profile.email ?? l10n.profileMissingValue,
                            subtitle: profile.newEmail == null
                                ? null
                                : l10n.profileEmailPendingChange(
                                    profile.newEmail!,
                                  ),
                            isValuePlaceholder:
                                profile.email?.trim().isEmpty ?? true,
                            onTap: () => _showEditFieldSheet(
                              context,
                              title: l10n.profileEmail,
                              description: l10n.profileEmailDescription,
                              initialValue: profile.email ?? '',
                              placeholder: l10n.profileEmailHint,
                              keyboardType: TextInputType.emailAddress,
                              validator: (value) => value.contains('@')
                                  ? null
                                  : l10n.profileInvalidEmail,
                              onSave: (value) => context
                                  .read<ProfileCubit>()
                                  .updateEmail(value),
                              successMessage: l10n.profileEmailUpdateNote,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const shad.Gap(32),
                  StaggeredEntry(
                    index: 2,
                    playOnceKey: 'profile-avatar',
                    child: _ProfilePanel(
                      title: l10n.profileAvatarSectionTitle,
                      description: l10n.profileAvatarDescription,
                      child: Column(
                        children: [
                          _ProfileActionTile(
                            icon: Icons.photo_camera_back_outlined,
                            title: profile.avatarUrl != null
                                ? l10n.profileChangeAvatar
                                : l10n.profileUploadAvatar,
                            value: profile.avatarUrl?.trim().isNotEmpty ?? false
                                ? l10n.profileAvatarSet
                                : l10n.profileMissingValue,
                            isValuePlaceholder:
                                profile.avatarUrl?.trim().isEmpty ?? true,
                            onTap: () => _pickAndUploadAvatar(context),
                          ),
                          if (profile.avatarUrl != null) const shad.Gap(12),
                          if (profile.avatarUrl != null)
                            _ProfileActionTile(
                              icon: Icons.delete_outline_rounded,
                              title: l10n.profileRemoveAvatar,
                              value: l10n.profileDangerAction,
                              isDestructive: true,
                              onTap: () => _confirmRemoveAvatar(context),
                            ),
                        ],
                      ),
                    ),
                  ),
                  const shad.Gap(32),
                  StaggeredEntry(
                    index: 3,
                    playOnceKey: 'profile-status',
                    child: _ProfilePanel(
                      title: l10n.profileAccountStatus,
                      description: l10n.profileAccountStatusDescription,
                      child: _ProfileStatusGrid(profile: profile),
                    ),
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }

  Future<void> _confirmRemoveAvatar(BuildContext context) async {
    final confirmed = await showAdaptiveSheet<bool>(
      context: context,
      maxDialogWidth: 420,
      builder: (dialogContext) => AppDialogScaffold(
        title: dialogContext.l10n.profileRemoveAvatar,
        description: dialogContext.l10n.profileRemoveAvatarDescription,
        icon: Icons.delete_outline_rounded,
        maxWidth: 420,
        maxHeightFactor: 0.56,
        actions: [
          shad.OutlineButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(dialogContext.l10n.profileCancel),
          ),
          shad.DestructiveButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(dialogContext.l10n.profileRemoveAvatar),
          ),
        ],
        child: const SizedBox.shrink(),
      ),
    );

    if (confirmed != true || !context.mounted) {
      return;
    }

    final success = await context.read<ProfileCubit>().removeAvatar();
    if (!context.mounted) {
      return;
    }

    shad.showToast(
      context: context,
      builder: (toastContext, _) => success
          ? shad.Alert(
              title: Text(toastContext.l10n.profileAvatarRemoveSuccess),
            )
          : shad.Alert.destructive(
              title: Text(toastContext.l10n.profileAvatarRemoveError),
            ),
    );
  }

  Future<void> _pickAndUploadAvatar(BuildContext context) async {
    final l10n = context.l10n;
    final picker = ImagePicker();
    final theme = shad.Theme.of(context);

    final source = await showImageSourcePickerDialog(
      context: context,
      title: l10n.selectImageSource,
      description: l10n.profileAvatarPickerDescription,
      cameraLabel: l10n.camera,
      galleryLabel: l10n.gallery,
    );

    if (!context.mounted || source == null) {
      return;
    }

    final pickedFile = await picker.pickImage(
      source: source,
      maxWidth: 1024,
      maxHeight: 1024,
      imageQuality: 85,
    );

    if (!context.mounted || pickedFile == null) {
      return;
    }

    final croppedFile = await ImageCropper().cropImage(
      sourcePath: pickedFile.path,
      aspectRatio: const CropAspectRatio(ratioX: 1, ratioY: 1),
      uiSettings: [
        AndroidUiSettings(
          toolbarTitle: l10n.profileAvatar,
          toolbarColor: theme.colorScheme.primary,
          toolbarWidgetColor: theme.colorScheme.primaryForeground,
          initAspectRatio: CropAspectRatioPreset.square,
          lockAspectRatio: true,
        ),
        IOSUiSettings(
          title: l10n.profileAvatar,
          aspectRatioLockEnabled: true,
          resetAspectRatioEnabled: false,
        ),
      ],
    );

    if (!context.mounted || croppedFile == null) {
      return;
    }

    final success = await context.read<ProfileCubit>().uploadAvatar(
      File(croppedFile.path),
    );
    if (!context.mounted) {
      return;
    }

    shad.showToast(
      context: context,
      builder: (toastContext, _) => success
          ? shad.Alert(
              title: Text(toastContext.l10n.profileAvatarUpdateSuccess),
            )
          : shad.Alert.destructive(
              title: Text(toastContext.l10n.profileAvatarUpdateError),
            ),
    );
  }

  Future<void> _showEditFieldSheet(
    BuildContext context, {
    required String title,
    required String description,
    required String initialValue,
    required String placeholder,
    required Future<bool> Function(String value) onSave,
    required String? Function(String value) validator,
    TextInputType? keyboardType,
    String? successMessage,
  }) async {
    await showAdaptiveSheet<void>(
      context: context,
      maxDialogWidth: 520,
      builder: (dialogContext) => _EditProfileFieldSheet(
        title: title,
        description: description,
        initialValue: initialValue,
        placeholder: placeholder,
        keyboardType: keyboardType,
        validator: validator,
        onSave: onSave,
        successMessage: successMessage,
      ),
    );
  }
}

class _EditProfileFieldSheet extends StatefulWidget {
  const _EditProfileFieldSheet({
    required this.title,
    required this.description,
    required this.initialValue,
    required this.placeholder,
    required this.validator,
    required this.onSave,
    this.keyboardType,
    this.successMessage,
  });

  final String title;
  final String description;
  final String initialValue;
  final String placeholder;
  final TextInputType? keyboardType;
  final String? Function(String value) validator;
  final Future<bool> Function(String value) onSave;
  final String? successMessage;

  @override
  State<_EditProfileFieldSheet> createState() => _EditProfileFieldSheetState();
}

class _EditProfileFieldSheetState extends State<_EditProfileFieldSheet> {
  late final TextEditingController _controller;
  String? _error;
  bool _isSaving = false;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.initialValue);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final value = _controller.text.trim();
    final validationError = widget.validator(value);
    if (validationError != null) {
      setState(() => _error = validationError);
      return;
    }

    setState(() {
      _error = null;
      _isSaving = true;
    });

    final success = await widget.onSave(value);
    if (!mounted) {
      return;
    }

    setState(() => _isSaving = false);
    if (success) {
      Navigator.of(context).pop();
      shad.showToast(
        context: context,
        builder: (toastContext, _) => shad.Alert(
          title: Text(toastContext.l10n.profileUpdateSuccess),
          content: widget.successMessage == null
              ? null
              : Text(widget.successMessage!),
        ),
      );
      return;
    }

    setState(() => _error = context.l10n.profileUpdateError);
  }

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return AppDialogScaffold(
      title: widget.title,
      description: widget.description,
      icon: Icons.edit_outlined,
      maxWidth: 520,
      actions: [
        shad.OutlineButton(
          onPressed: _isSaving ? null : () => Navigator.of(context).pop(),
          child: Text(context.l10n.profileCancel),
        ),
        shad.PrimaryButton(
          onPressed: _isSaving ? null : _save,
          child: _isSaving
              ? const SizedBox.square(
                  dimension: 16,
                  child: shad.CircularProgressIndicator(),
                )
              : Text(context.l10n.profileSave),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          shad.TextField(
            controller: _controller,
            placeholder: Text(widget.placeholder),
            keyboardType: widget.keyboardType,
            enabled: !_isSaving,
            autofocus: true,
          ),
          if (_error != null) ...[
            const shad.Gap(8),
            Text(
              _error!,
              style: theme.typography.small.copyWith(
                color: theme.colorScheme.destructive,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _ProfileActionTile extends StatelessWidget {
  const _ProfileActionTile({
    required this.icon,
    required this.title,
    required this.value,
    required this.onTap,
    this.isDestructive = false,
    this.subtitle,
    this.isValuePlaceholder = false,
  });

  final IconData icon;
  final String title;
  final String value;
  final String? subtitle;
  final VoidCallback onTap;
  final bool isDestructive;
  final bool isValuePlaceholder;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final accent = isDestructive
        ? theme.colorScheme.destructive
        : theme.colorScheme.primary;
    final valueColor = isValuePlaceholder
        ? theme.colorScheme.foreground.withValues(alpha: 0.58)
        : theme.colorScheme.foreground;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Ink(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: theme.colorScheme.background.withValues(alpha: 0.78),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: theme.colorScheme.border),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: accent.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(14),
                ),
                alignment: Alignment.center,
                child: Icon(icon, size: 20, color: accent),
              ),
              const shad.Gap(12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: theme.typography.small.copyWith(
                        fontWeight: FontWeight.w800,
                        color: isDestructive ? accent : null,
                      ),
                    ),
                    const shad.Gap(4),
                    Text(
                      value,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: theme.typography.base.copyWith(
                        fontWeight: FontWeight.w600,
                        color: valueColor,
                      ),
                    ),
                    if (subtitle?.trim().isNotEmpty ?? false) ...[
                      const shad.Gap(4),
                      Text(
                        subtitle!,
                        style: theme.typography.textSmall.copyWith(
                          color: theme.colorScheme.mutedForeground,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const shad.Gap(10),
              Icon(
                Icons.chevron_right_rounded,
                size: 18,
                color: theme.colorScheme.mutedForeground,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ProfileHeroCard extends StatelessWidget {
  const _ProfileHeroCard({
    required this.profile,
    required this.state,
  });

  final UserProfile profile;
  final ProfileState state;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final l10n = context.l10n;
    final displayName = profile.displayName?.trim().isNotEmpty ?? false
        ? profile.displayName!.trim()
        : profile.fullName?.trim().isNotEmpty ?? false
        ? profile.fullName!.trim()
        : profile.email ?? l10n.profileTitle;

    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(28),
        gradient: LinearGradient(
          colors: [
            theme.colorScheme.primary.withValues(alpha: 0.18),
            theme.colorScheme.card,
            theme.colorScheme.secondary.withValues(alpha: 0.15),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        border: Border.all(
          color: theme.colorScheme.border.withValues(alpha: 0.75),
        ),
      ),
      padding: const EdgeInsets.all(22),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _LargeProfileAvatar(profile: profile),
              const shad.Gap(14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      displayName,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.typography.large.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const shad.Gap(2),
                    Text(
                      profile.email ?? l10n.profileMissingValue,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.typography.textSmall.copyWith(
                        color: theme.colorScheme.mutedForeground,
                      ),
                    ),
                  ],
                ),
              ),
              if (state.isRefreshing)
                const SizedBox.square(
                  dimension: 18,
                  child: shad.CircularProgressIndicator(),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _LargeProfileAvatar extends StatelessWidget {
  const _LargeProfileAvatar({required this.profile});

  final UserProfile profile;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final source =
        profile.displayName ?? profile.fullName ?? profile.email ?? '?';
    final initials = source.trim().isEmpty
        ? '?'
        : source.trim()[0].toUpperCase();

    return Container(
      width: 74,
      height: 74,
      decoration: BoxDecoration(
        color: theme.colorScheme.background.withValues(alpha: 0.92),
        borderRadius: BorderRadius.circular(22),
      ),
      alignment: Alignment.center,
      child: profile.avatarUrl?.trim().isNotEmpty ?? false
          ? ClipRRect(
              borderRadius: BorderRadius.circular(22),
              child: Image.network(
                profile.avatarUrl!,
                width: 74,
                height: 74,
                fit: BoxFit.cover,
              ),
            )
          : Text(
              initials,
              style: theme.typography.h2.copyWith(fontWeight: FontWeight.w800),
            ),
    );
  }
}

class _ProfilePanel extends StatelessWidget {
  const _ProfilePanel({
    required this.title,
    required this.description,
    required this.child,
  });

  final String title;
  final String description;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: theme.typography.large.copyWith(fontWeight: FontWeight.w800),
        ),
        const shad.Gap(6),
        Text(
          description,
          style: theme.typography.textSmall.copyWith(
            color: theme.colorScheme.mutedForeground,
          ),
        ),
        const shad.Gap(14),
        child,
      ],
    );
  }
}

class _ProfileStatusGrid extends StatelessWidget {
  const _ProfileStatusGrid({required this.profile});

  final UserProfile profile;

  @override
  Widget build(BuildContext context) {
    final joined = profile.createdAt == null
        ? context.l10n.profileStatusUnknown
        : DateFormat.yMMMd(Localizations.localeOf(context).toString()).format(
            profile.createdAt!,
          );

    return Column(
      children: [
        _StatusCard(
          label: context.l10n.profileStatus,
          value: context.l10n.profileActive,
          icon: Icons.verified_user_outlined,
        ),
        const shad.Gap(12),
        _StatusCard(
          label: context.l10n.profileVerification,
          value: context.l10n.profileVerified,
          icon: Icons.verified_outlined,
        ),
        const shad.Gap(12),
        _StatusCard(
          label: context.l10n.profileMemberSince,
          value: joined,
          icon: Icons.event_outlined,
        ),
      ],
    );
  }
}

class _StatusCard extends StatelessWidget {
  const _StatusCard({
    required this.label,
    required this.value,
    required this.icon,
  });

  final String label;
  final String value;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: theme.colorScheme.background.withValues(alpha: 0.78),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: theme.colorScheme.border),
      ),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: theme.colorScheme.primary.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(12),
            ),
            alignment: Alignment.center,
            child: Icon(
              icon,
              size: 18,
              color: theme.colorScheme.primary,
            ),
          ),
          const shad.Gap(10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: theme.typography.xSmall.copyWith(
                    color: theme.colorScheme.mutedForeground,
                  ),
                ),
                const shad.Gap(2),
                Text(
                  value,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.typography.small.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
