import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart'
    hide AlertDialog, AppBar, FilledButton, Scaffold, TextButton;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:image_cropper/image_cropper.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mobile/data/repositories/profile_repository.dart';
import 'package:mobile/features/profile/cubit/profile_cubit.dart';
import 'package:mobile/features/profile/cubit/profile_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class ProfilePage extends StatelessWidget {
  const ProfilePage({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (context) {
        final cubit = ProfileCubit(
          profileRepository: ProfileRepository(),
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

    return shad.Scaffold(
      headers: [
        shad.AppBar(
          title: Text(l10n.profileTitle),
          leading: [
            shad.GhostButton(
              onPressed: () => context.pop(),
              density: shad.ButtonDensity.icon,
              child: const Icon(Icons.arrow_back),
            ),
          ],
        ),
      ],
      child: BlocBuilder<ProfileCubit, ProfileState>(
        builder: (context, state) {
          if (state.status == ProfileStatus.loading) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const CircularProgressIndicator(),
                  const shad.Gap(16),
                  Text(l10n.profileLoading),
                ],
              ),
            );
          }

          if (state.status == ProfileStatus.error || state.profile == null) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    state.error ?? l10n.profileUpdateError,
                    textAlign: TextAlign.center,
                  ),
                  const shad.Gap(16),
                  shad.PrimaryButton(
                    onPressed: () => context.read<ProfileCubit>().loadProfile(),
                    child: Text(l10n.commonRetry),
                  ),
                ],
              ),
            );
          }

          final profile = state.profile!;

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              // Avatar Section
              _AvatarSection(
                avatarUrl: profile.avatarUrl,
                displayName: profile.displayName,
                email: profile.email,
              ),
              const shad.Gap(24),
              const shad.Divider(),
              const shad.Gap(16),

              // Account Status
              _AccountStatusCard(
                createdAt: profile.createdAt,
              ),
              const shad.Gap(24),

              // Display Name
              _DisplayNameField(
                defaultValue: profile.displayName,
              ),
              const shad.Gap(16),

              // Full Name
              _FullNameField(
                defaultValue: profile.fullName,
              ),
              const shad.Gap(16),

              // Email
              _EmailField(
                email: profile.email,
                newEmail: profile.newEmail,
              ),
            ],
          );
        },
      ),
    );
  }
}

class _AvatarSection extends StatelessWidget {
  const _AvatarSection({
    this.avatarUrl,
    this.displayName,
    this.email,
  });

  final String? avatarUrl;
  final String? displayName;
  final String? email;

  String _getInitials() {
    if (displayName != null && displayName!.isNotEmpty) {
      return displayName!.substring(0, 1).toUpperCase();
    }
    if (email != null && email!.isNotEmpty) {
      return email!.substring(0, 1).toUpperCase();
    }
    return '?';
  }

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Column(
      children: [
        Center(
          child: BlocBuilder<ProfileCubit, ProfileState>(
            buildWhen: (prev, curr) => prev.isLoading != curr.isLoading,
            builder: (context, state) {
              return Stack(
                children: [
                  Opacity(
                    opacity: state.isLoading ? 0.5 : 1.0,
                    child: CircleAvatar(
                      radius: 48,
                      backgroundImage: avatarUrl != null
                          ? NetworkImage(avatarUrl!)
                          : null,
                      child: avatarUrl == null
                          ? Text(
                              _getInitials(),
                              style: theme.typography.h2,
                            )
                          : null,
                    ),
                  ),
                  if (state.isLoading)
                    const Positioned.fill(
                      child: Center(
                        child: shad.CircularProgressIndicator(),
                      ),
                    ),
                  Positioned(
                    bottom: 0,
                    right: 0,
                    child: shad.GhostButton(
                      onPressed: state.isLoading
                          ? null
                          : () => unawaited(_showAvatarOptions(context)),
                      density: shad.ButtonDensity.icon,
                      child: const Icon(Icons.edit, size: 16),
                    ),
                  ),
                ],
              );
            },
          ),
        ),
      ],
    );
  }

  Future<void> _pickAndUploadAvatar(BuildContext context) async {
    final l10n = context.l10n;
    final cubit = context.read<ProfileCubit>();
    final picker = ImagePicker();
    final theme = shad.Theme.of(context);

    final source = await showDialog<ImageSource>(
      context: context,
      builder: (context) => Center(
        child: SizedBox(
          width: MediaQuery.of(context).size.width * 0.8,
          child: shad.AlertDialog(
            title: const Text('Select Image Source'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                shad.GhostButton(
                  onPressed: () => Navigator.pop(context, ImageSource.camera),
                  child: const Row(
                    children: [
                      Icon(Icons.camera_alt),
                      shad.Gap(8),
                      Text('Camera'),
                    ],
                  ),
                ),
                shad.GhostButton(
                  onPressed: () => Navigator.pop(context, ImageSource.gallery),
                  child: const Row(
                    children: [
                      Icon(Icons.photo_library),
                      shad.Gap(8),
                      Text('Gallery'),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );

    if (source == null) return;

    final pickedFile = await picker.pickImage(
      source: source,
      maxWidth: 1024,
      maxHeight: 1024,
      imageQuality: 85,
    );

    if (pickedFile == null) return;

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

    if (croppedFile == null) return;

    await cubit.uploadAvatar(File(croppedFile.path));
  }

  Future<void> _showAvatarOptions(BuildContext context) async {
    final l10n = context.l10n;
    final cubit = context.read<ProfileCubit>();

    await showDialog<void>(
      context: context,
      builder: (dialogContext) => Center(
        child: SizedBox(
          width: MediaQuery.of(context).size.width * 0.8,
          child: shad.AlertDialog(
            title: Text(l10n.profileAvatar),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (avatarUrl != null) ...[
                  shad.GhostButton(
                    onPressed: () async {
                      Navigator.pop(dialogContext);
                      await cubit.removeAvatar();
                    },
                    child: Text(l10n.profileRemoveAvatar),
                  ),
                  const shad.Gap(8),
                ],
                shad.GhostButton(
                  onPressed: () {
                    Navigator.pop(dialogContext);
                    unawaited(_pickAndUploadAvatar(context));
                  },
                  child: Text(
                    avatarUrl != null
                        ? l10n.profileChangeAvatar
                        : l10n.profileUploadAvatar,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _AccountStatusCard extends StatelessWidget {
  const _AccountStatusCard({this.createdAt});

  final DateTime? createdAt;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final l10n = context.l10n;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: theme.colorScheme.muted.withValues(alpha: 0.3),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            l10n.profileAccountStatus,
            style: theme.typography.semiBold,
          ),
          const shad.Gap(12),
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Status',
                      style: theme.typography.textMuted,
                    ),
                    Text(
                      l10n.profileActive,
                      style: theme.typography.semiBold,
                    ),
                  ],
                ),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Verification',
                      style: theme.typography.textMuted,
                    ),
                    Text(
                      l10n.profileVerified,
                      style: theme.typography.semiBold,
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (createdAt != null) ...[
            const shad.Gap(12),
            Text(
              l10n.profileMemberSince,
              style: theme.typography.textMuted,
            ),
            Text(
              _formatDate(createdAt!),
              style: theme.typography.semiBold,
            ),
          ],
        ],
      ),
    );
  }

  String _formatDate(DateTime date) {
    return '${date.day}/${date.month}/${date.year}';
  }
}

class _DisplayNameField extends StatefulWidget {
  const _DisplayNameField({this.defaultValue});

  final String? defaultValue;

  @override
  State<_DisplayNameField> createState() => _DisplayNameFieldState();
}

class _DisplayNameFieldState extends State<_DisplayNameField> {
  late final TextEditingController _controller;
  bool _hasChanges = false;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.defaultValue ?? '');
    _controller.addListener(_onTextChanged);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onTextChanged() {
    setState(() {
      _hasChanges = _controller.text != (widget.defaultValue ?? '');
    });
  }

  Future<void> _save(BuildContext context) async {
    final value = _controller.text.trim();
    if (value.isEmpty) {
      shad.showToast(
        context: context,
        builder: (context, overlay) => shad.Alert.destructive(
          title: Text(context.l10n.profileUpdateError),
          content: const Text('Display name cannot be empty'),
        ),
      );
      return;
    }

    final cubit = context.read<ProfileCubit>();
    final success = await cubit.updateDisplayName(value);

    if (success && context.mounted) {
      setState(() {
        _hasChanges = false;
      });
      shad.showToast(
        context: context,
        builder: (context, overlay) => shad.Alert(
          title: Text(context.l10n.profileUpdateSuccess),
        ),
      );
    } else if (context.mounted) {
      shad.showToast(
        context: context,
        builder: (context, overlay) => shad.Alert.destructive(
          title: Text(context.l10n.profileUpdateError),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return BlocBuilder<ProfileCubit, ProfileState>(
      buildWhen: (prev, curr) => prev.isLoading != curr.isLoading,
      builder: (context, state) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(l10n.profileDisplayName),
            const shad.Gap(8),
            Row(
              children: [
                Expanded(
                  child: shad.TextField(
                    controller: _controller,
                    placeholder: Text(l10n.profileDisplayNameHint),
                    enabled: !state.isLoading,
                  ),
                ),
                if (_hasChanges) ...[
                  const shad.Gap(8),
                  shad.PrimaryButton(
                    onPressed: state.isLoading ? null : () => _save(context),
                    density: shad.ButtonDensity.icon,
                    child: state.isLoading
                        ? const shad.CircularProgressIndicator(size: 16)
                        : const Icon(Icons.check, size: 20),
                  ),
                ],
              ],
            ),
          ],
        );
      },
    );
  }
}

class _FullNameField extends StatefulWidget {
  const _FullNameField({this.defaultValue});

  final String? defaultValue;

  @override
  State<_FullNameField> createState() => _FullNameFieldState();
}

class _FullNameFieldState extends State<_FullNameField> {
  late final TextEditingController _controller;
  bool _hasChanges = false;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.defaultValue ?? '');
    _controller.addListener(_onTextChanged);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onTextChanged() {
    setState(() {
      _hasChanges = _controller.text != (widget.defaultValue ?? '');
    });
  }

  Future<void> _save(BuildContext context) async {
    final value = _controller.text.trim();
    if (value.isEmpty) {
      shad.showToast(
        context: context,
        builder: (context, overlay) => shad.Alert.destructive(
          title: Text(context.l10n.profileUpdateError),
          content: const Text('Full name cannot be empty'),
        ),
      );
      return;
    }

    final cubit = context.read<ProfileCubit>();
    final success = await cubit.updateFullName(value);

    if (success && context.mounted) {
      setState(() {
        _hasChanges = false;
      });
      shad.showToast(
        context: context,
        builder: (context, overlay) => shad.Alert(
          title: Text(context.l10n.profileUpdateSuccess),
        ),
      );
    } else if (context.mounted) {
      shad.showToast(
        context: context,
        builder: (context, overlay) => shad.Alert.destructive(
          title: Text(context.l10n.profileUpdateError),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return BlocBuilder<ProfileCubit, ProfileState>(
      buildWhen: (prev, curr) => prev.isLoading != curr.isLoading,
      builder: (context, state) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(l10n.profileFullName),
            const shad.Gap(8),
            Row(
              children: [
                Expanded(
                  child: shad.TextField(
                    controller: _controller,
                    placeholder: Text(l10n.profileFullNameHint),
                    enabled: !state.isLoading,
                  ),
                ),
                if (_hasChanges) ...[
                  const shad.Gap(8),
                  shad.PrimaryButton(
                    onPressed: state.isLoading ? null : () => _save(context),
                    density: shad.ButtonDensity.icon,
                    child: state.isLoading
                        ? const shad.CircularProgressIndicator(size: 16)
                        : const Icon(Icons.check, size: 20),
                  ),
                ],
              ],
            ),
          ],
        );
      },
    );
  }
}

class _EmailField extends StatefulWidget {
  const _EmailField({this.email, this.newEmail});

  final String? email;
  final String? newEmail;

  @override
  State<_EmailField> createState() => _EmailFieldState();
}

class _EmailFieldState extends State<_EmailField> {
  late final TextEditingController _controller;
  bool _hasChanges = false;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.email ?? '');
    _controller.addListener(_onTextChanged);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onTextChanged() {
    setState(() {
      _hasChanges = _controller.text != (widget.email ?? '');
    });
  }

  Future<void> _save(BuildContext context) async {
    final value = _controller.text.trim();
    if (value.isEmpty || !value.contains('@')) {
      shad.showToast(
        context: context,
        builder: (context, overlay) => shad.Alert.destructive(
          title: Text(context.l10n.profileUpdateError),
          content: const Text('Please enter a valid email address'),
        ),
      );
      return;
    }

    final cubit = context.read<ProfileCubit>();
    final success = await cubit.updateEmail(value);

    if (success && context.mounted) {
      setState(() {
        _hasChanges = false;
      });
      shad.showToast(
        context: context,
        builder: (context, overlay) => shad.Alert(
          title: Text(context.l10n.profileUpdateSuccess),
          content: Text(context.l10n.profileEmailUpdateNote),
        ),
      );
    } else if (context.mounted) {
      shad.showToast(
        context: context,
        builder: (context, overlay) => shad.Alert.destructive(
          title: Text(context.l10n.profileUpdateError),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);

    return BlocBuilder<ProfileCubit, ProfileState>(
      buildWhen: (prev, curr) => prev.isLoading != curr.isLoading,
      builder: (context, state) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.newEmail != null
                  ? l10n.profileCurrentEmail
                  : l10n.profileEmail,
            ),
            const shad.Gap(8),
            Row(
              children: [
                Expanded(
                  child: shad.TextField(
                    controller: _controller,
                    placeholder: Text(l10n.profileEmailHint),
                    keyboardType: TextInputType.emailAddress,
                    enabled: !state.isLoading,
                  ),
                ),
                if (_hasChanges) ...[
                  const shad.Gap(8),
                  shad.PrimaryButton(
                    onPressed: state.isLoading ? null : () => _save(context),
                    density: shad.ButtonDensity.icon,
                    child: state.isLoading
                        ? const shad.CircularProgressIndicator(size: 16)
                        : const Icon(Icons.check, size: 20),
                  ),
                ],
              ],
            ),
            if (widget.newEmail != null) ...[
              const shad.Gap(16),
              Text(l10n.profileNewEmail),
              const shad.Gap(8),
              shad.TextField(
                initialValue: widget.newEmail,
                enabled: false,
              ),
              const shad.Gap(8),
              Text(
                l10n.profileEmailUpdateNote,
                style: theme.typography.textMuted,
              ),
            ],
          ],
        );
      },
    );
  }
}
