import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/core/widgets/profile_media_image.dart';
import 'package:mobile/data/models/profile_media_result.dart';
import 'package:mobile/data/models/user_profile.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/profile/cubit/profile_cubit.dart';
import 'package:mobile/features/profile/cubit/profile_state.dart';
import 'package:mobile/features/profile/view/profile_banner_picker.dart';
import 'package:mobile/features/profile/view/profile_media_failure_message.dart';
import 'package:mobile/features/profile/view/profile_picker_intent.dart';
import 'package:mobile/features/settings/view/settings_dialogs.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Full-width banner; errors keep the surrounding identity usable.
class ProfileBanner extends StatelessWidget {
  const ProfileBanner({required this.profile, super.key});
  final UserProfile profile;
  @override
  Widget build(BuildContext context) {
    final url = profile.bannerUrl;
    final hasImage = url != null && url.isNotEmpty;
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(18),
        child: AspectRatio(
          aspectRatio: 3,
          child: !hasImage
              ? _placeholder(context)
              : Image(
                  image: profileMediaImage(url, profile.id),
                  key: ValueKey('${profile.id}:$url'),
                  fit: BoxFit.cover,
                  semanticLabel: context.l10n.profileBanner,
                  frameBuilder: (context, child, frame, synchronous) =>
                      synchronous || frame != null
                      ? child
                      : _placeholder(context, loading: true),
                  errorBuilder: (_, _, _) => _placeholder(context),
                ),
        ),
      ),
    );
  }

  Widget _placeholder(BuildContext context, {bool loading = false}) =>
      ColoredBox(
        color: AppTokens.of(context).colorScheme.muted,
        child: Center(
          child: loading
              ? const CircularProgressIndicator()
              : Icon(
                  Icons.panorama_outlined,
                  semanticLabel: context.l10n.profileBanner,
                ),
        ),
      );
}

/// The cover banner as one Edit profile row: adding opens the picker; an
/// existing banner offers change or remove. Failures show under the row.
class ProfileBannerSettings extends StatelessWidget {
  const ProfileBannerSettings({
    required this.profile,
    required this.busy,
    super.key,
  });
  final UserProfile profile;
  final bool busy;
  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final exists = profile.bannerUrl?.isNotEmpty ?? false;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        SettingsTile(
          key: const ValueKey('profile-banner-row'),
          grouped: true,
          icon: LucideIcons.imagePlus,
          title: l10n.profileCoverBanner,
          value: exists ? l10n.profileMediaSet : l10n.profileMissingValue,
          onTap: busy
              ? null
              : () => exists
                    ? _chooseExisting(context)
                    : pickAndUploadProfileBanner(context),
        ),
        _BannerFailure(actor: profile.id),
      ],
    );
  }

  Future<void> _chooseExisting(BuildContext context) async {
    final l10n = context.l10n;
    final choice = await showSettingsChoiceDialog<String>(
      context: context,
      title: l10n.profileCoverBanner,
      currentValue: '',
      options: [
        SettingsChoiceOption(
          value: 'change',
          label: l10n.profileChangeBanner,
          icon: LucideIcons.imagePlus,
        ),
        SettingsChoiceOption(
          value: 'remove',
          label: l10n.profileRemoveBanner,
          icon: LucideIcons.trash2,
        ),
      ],
    );
    if (!context.mounted || choice == null) return;
    if (choice == 'change') {
      await pickAndUploadProfileBanner(context);
    } else {
      await _change(context, () => context.read<ProfileCubit>().removeBanner());
    }
  }

  Future<void> _change(
    BuildContext context,
    Future<bool> Function() change,
  ) async {
    final intent = ProfilePickerIntent.capture(context);
    if (intent == null) return;
    intent.cubit.clearMediaFailure();
    try {
      final success = await change();
      if (!context.mounted || !intent.current(context) || success) return;
      shad.showToast(
        context: context,
        builder: (context, _) => shad.Alert(
          content: Text(
            profileMediaFailureMessage(
              context.l10n,
              intent.cubit.state.mediaFailure,
            ),
          ),
        ),
      );
    } finally {
      await intent.dispose();
    }
  }
}

/// Current state drives visibility, never a superseded picker's return value.
class _BannerFailure extends StatelessWidget {
  const _BannerFailure({required this.actor});
  final String actor;
  @override
  Widget build(BuildContext context) => BlocBuilder<AuthCubit, AuthState>(
    builder: (context, auth) => BlocBuilder<ProfileCubit, ProfileState>(
      builder: (context, state) {
        final failure = state.mediaFailure;
        if (auth.status != AuthStatus.authenticated ||
            auth.user?.id != actor ||
            state.profile?.id != actor ||
            failure == null ||
            (state.mediaTarget != ProfileMediaTarget.banner &&
                state.mediaTarget != ProfileMediaTarget.removeBanner)) {
          return const SizedBox.shrink();
        }
        return Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
          child: shad.Alert.destructive(
            content: Text(profileMediaFailureMessage(context.l10n, failure)),
          ),
        );
      },
    ),
  );
}
