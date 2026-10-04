import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mobile/core/widgets/profile_media_image.dart';
import 'package:mobile/data/models/user_profile.dart';
import 'package:mobile/features/profile/cubit/profile_cubit.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/image_source_picker_dialog.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Full-width banner; errors keep the surrounding identity usable.
class ProfileBanner extends StatelessWidget {
  const ProfileBanner({required this.profile, super.key});
  final UserProfile profile;
  @override
  Widget build(BuildContext context) {
    final url = profile.bannerUrl;
    if (url == null || url.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(18),
        child: AspectRatio(
          aspectRatio: 3,
          child: Image(
            image: profileMediaImage(url, profile.id),
            key: ValueKey('${profile.id}:$url'),
            fit: BoxFit.cover,
            semanticLabel: context.l10n.profileBanner,
            errorBuilder: (_, _, _) => ColoredBox(
              color: shad.Theme.of(context).colorScheme.muted,
              child: const Center(child: Icon(Icons.panorama_outlined)),
            ),
          ),
        ),
      ),
    );
  }
}

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
    return SettingsPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            l10n.profileBanner,
            style: shad.Theme.of(context).typography.large,
          ),
          const SizedBox(height: 6),
          Text(l10n.profileBannerDescription),
          const SizedBox(height: 12),
          ProfileBanner(profile: profile),
          Wrap(
            spacing: 12,
            runSpacing: 8,
            children: [
              shad.OutlineButton(
                onPressed: busy ? null : () => _pick(context),
                leading: const Icon(Icons.add_photo_alternate_outlined),
                child: Text(
                  exists ? l10n.profileChangeBanner : l10n.profileAddBanner,
                ),
              ),
              if (exists)
                shad.GhostButton(
                  onPressed: busy
                      ? null
                      : () => _change(
                          context,
                          () => context.read<ProfileCubit>().removeBanner(),
                        ),
                  child: Text(l10n.profileRemoveBanner),
                ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _pick(BuildContext context) async {
    final l10n = context.l10n;
    final cubit = context.read<ProfileCubit>();
    final actor = profile.id;
    final source = await showImageSourcePickerDialog(
      context: context,
      title: l10n.profileBanner,
      cameraLabel: l10n.camera,
      galleryLabel: l10n.gallery,
    );
    if (!context.mounted ||
        source == null ||
        cubit.state.profile?.id != actor) {
      return;
    }
    final file = await ImagePicker().pickImage(
      source: source,
      maxWidth: 2048,
      maxHeight: 2048,
      imageQuality: 85,
    );
    if (!context.mounted || file == null || cubit.state.profile?.id != actor) {
      return;
    }
    await _change(context, () => cubit.uploadBanner(File(file.path)));
  }

  Future<void> _change(
    BuildContext context,
    Future<bool> Function() change,
  ) async {
    final cubit = context.read<ProfileCubit>();
    final success = await change();
    if (!context.mounted || cubit.state.profile?.id != profile.id) return;
    if (!success) {
      shad.showToast(
        context: context,
        builder: (context, _) =>
            shad.Alert(content: Text(context.l10n.profileUpdateError)),
      );
    }
  }
}
