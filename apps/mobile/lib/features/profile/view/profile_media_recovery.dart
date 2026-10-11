import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/data/models/profile_media_result.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/profile/cubit/profile_cubit.dart';
import 'package:mobile/features/profile/cubit/profile_state.dart';
import 'package:mobile/features/profile/view/profile_avatar_picker.dart';
import 'package:mobile/features/profile/view/profile_banner_picker.dart';
import 'package:mobile/features/profile/view/profile_media_failure_message.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/internal_diagnostics_copy.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Persistent, localized recovery for an authorized media failure.
class ProfileMediaRecovery extends StatelessWidget {
  const ProfileMediaRecovery({
    required this.state,
    required this.avatarPicker,
    required this.pickerContext,
    super.key,
  });
  final ProfileState state;
  final ProfileAvatarPicker avatarPicker;

  /// Screen-owned ancestor stays mounted when clearing the alert.
  final BuildContext pickerContext;
  @override
  Widget build(BuildContext context) {
    final failure = state.mediaFailure;
    final actor = state.profile?.id;
    if (failure == null || actor == null) return const SizedBox.shrink();
    return BlocBuilder<AuthCubit, AuthState>(
      builder: (context, auth) {
        if (auth.status != AuthStatus.authenticated || auth.user?.id != actor) {
          return const SizedBox.shrink();
        }
        final ownerAuth = context.read<AuthCubit>();
        final cubit = context.read<ProfileCubit>();
        bool current() =>
            context.mounted &&
            !ownerAuth.isClosed &&
            identical(context.read<AuthCubit>(), ownerAuth) &&
            ownerAuth.state.status == AuthStatus.authenticated &&
            ownerAuth.state.user?.id == actor &&
            identical(context.read<ProfileCubit>(), cubit) &&
            !cubit.isClosed &&
            cubit.state.profile?.id == actor &&
            !cubit.state.isLoading &&
            identical(cubit.state.mediaFailure, failure);
        final target = state.mediaTarget;
        return Padding(
          padding: const EdgeInsets.only(bottom: 16),
          child: shad.Alert.destructive(
            title: Text(context.l10n.profileMediaRecoveryTitle),
            content: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(profileMediaFailureMessage(context.l10n, failure)),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    if (target != null)
                      shad.OutlineButton(
                        onPressed: state.isLoading
                            ? null
                            : () async {
                                if (!current()) return;
                                if (target == ProfileMediaTarget.avatar) {
                                  await pickAndUploadProfileAvatar(
                                    pickerContext,
                                    picker: avatarPicker,
                                  );
                                } else if (target ==
                                    ProfileMediaTarget.banner) {
                                  await pickAndUploadProfileBanner(
                                    pickerContext,
                                  );
                                } else {
                                  cubit.clearMediaFailure();
                                  if (target ==
                                      ProfileMediaTarget.removeAvatar) {
                                    await cubit.removeAvatar();
                                  } else {
                                    await cubit.removeBanner();
                                  }
                                }
                              },
                        child: Text(switch (target) {
                          ProfileMediaTarget.removeAvatar =>
                            context.l10n.profileRemoveAvatar,
                          ProfileMediaTarget.removeBanner =>
                            context.l10n.profileRemoveBanner,
                          _ => context.l10n.profileMediaSelectAgain,
                        }),
                      ),
                    InternalDiagnosticsCopy(
                      diagnostics: failure.diagnostics,
                      userId: actor,
                    ),
                    shad.GhostButton(
                      onPressed: () {
                        if (current()) cubit.clearMediaFailure();
                      },
                      child: Text(context.l10n.profileMediaDismiss),
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
