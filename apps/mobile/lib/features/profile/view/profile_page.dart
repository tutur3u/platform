import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart' hide AppBar, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:image_cropper/image_cropper.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/input/platform_text_context_menu.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/data/models/user_profile.dart';
import 'package:mobile/data/repositories/profile_repository.dart';
import 'package:mobile/features/apps/widgets/app_card_palette.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/profile/cubit/profile_cubit.dart';
import 'package:mobile/features/profile/cubit/profile_state.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';
import 'package:mobile/widgets/image_source_picker_dialog.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:mobile/widgets/staggered_entry.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

part 'profile_page_widgets.dart';

class ProfilePage extends StatelessWidget {
  const ProfilePage({super.key, this.profileRepository});

  final ProfileRepository? profileRepository;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) {
        final cubit = ProfileCubit(
          profileRepository:
              profileRepository ??
              ProfileRepository(ownsApiClient: true, ownsHttpClient: true),
        );
        unawaited(cubit.loadProfile());
        return cubit;
      },
      child: ResponsiveWrapper(
        maxWidth: ResponsivePadding.maxContentWidth(context.deviceClass),
        child: const _ProfileView(),
      ),
    );
  }
}

class _ProfileView extends StatelessWidget {
  const _ProfileView();

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return MultiBlocListener(
      listeners: [
        BlocListener<AuthCubit, AuthState>(
          listenWhen: (previous, current) =>
              previous.user?.id != current.user?.id,
          listener: (context, _) {
            ProfileCubit.clearMemoryCache();
            unawaited(
              context.read<ProfileCubit>().loadProfile(forceRefresh: true),
            );
          },
        ),
        BlocListener<ProfileCubit, ProfileState>(
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
        ),
      ],
      child: shad.Scaffold(
        child: BlocBuilder<ProfileCubit, ProfileState>(
          builder: (context, state) {
            if (state.status == ProfileStatus.loading &&
                state.profile == null) {
              return Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const NovaLoadingIndicator(),
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
                        onPressed: () => context
                            .read<ProfileCubit>()
                            .loadProfile(forceRefresh: true),
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

            return NovaRefreshIndicator(
              onRefresh: () =>
                  context.read<ProfileCubit>().loadProfile(forceRefresh: true),
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(
                  parent: BouncingScrollPhysics(),
                ),
                padding: EdgeInsets.fromLTRB(
                  ResponsivePadding.horizontal(context.deviceClass),
                  20,
                  ResponsivePadding.horizontal(context.deviceClass),
                  28 + MediaQuery.paddingOf(context).bottom,
                ),
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
                            subtitle:
                                profile.newEmail?.trim().isNotEmpty != true
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
                  child: NovaLoadingIndicator(size: 20),
                )
              : Text(context.l10n.profileSave),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          shad.TextField(
            contextMenuBuilder: platformTextContextMenuBuilder(),
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
