import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/input/platform_text_context_menu.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/widgets/profile_media_image.dart';
import 'package:mobile/data/models/user_profile.dart';
import 'package:mobile/data/repositories/profile_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/profile/cubit/profile_cubit.dart';
import 'package:mobile/features/profile/cubit/profile_state.dart';
import 'package:mobile/features/profile/view/profile_avatar_picker.dart';
import 'package:mobile/features/profile/view/profile_avatar_removal.dart';
import 'package:mobile/features/profile/view/profile_banner.dart';
import 'package:mobile/features/profile/view/profile_media_recovery.dart';
import 'package:mobile/features/settings/view/settings_row_layout.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:mobile/widgets/pending_sync_frame.dart';
import 'package:mobile/widgets/staggered_entry.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

part 'profile_page_widgets.dart';
part 'profile_settings_groups.dart';

class ProfilePage extends StatelessWidget {
  const ProfilePage({
    super.key,
    this.profileRepository,
    this.avatarPicker = const ProfileAvatarPicker(),
  });

  final ProfileRepository? profileRepository;
  final ProfileAvatarPicker avatarPicker;

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
        maxWidth: ResponsivePadding.rootContentWidth(context.deviceClass),
        child: _ProfileView(avatarPicker: avatarPicker),
      ),
    );
  }
}

class _ProfileView extends StatelessWidget {
  const _ProfileView({required this.avatarPicker});

  final ProfileAvatarPicker avatarPicker;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final pickerContext = context;

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
                padding: SettingsRowLayout.scrollPadding(
                  context,
                  ResponsivePadding.horizontal(context.deviceClass),
                ),
                children: [
                  ProfileMediaRecovery(
                    state: state,
                    avatarPicker: avatarPicker,
                    pickerContext: pickerContext,
                  ),
                  StaggeredEntry(
                    index: 0,
                    playOnceKey: 'profile-hero',
                    child: _ProfileHeroCard(profile: profile, state: state),
                  ),
                  const shad.Gap(SettingsRowLayout.groupGap),
                  _ProfileSettingsGroups(
                    profile: profile,
                    editField: _showEditFieldSheet,
                    avatarPicker: avatarPicker,
                    busy: state.isLoading,
                  ),
                ],
              ),
            );
          },
        ),
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
            selectionControls: platformTextSelectionControls(),
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
