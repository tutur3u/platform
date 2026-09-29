import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/shell/avatar_url_identity.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_state.dart';

class ProfileNavigationAvatar extends StatelessWidget {
  const ProfileNavigationAvatar({super.key});

  @override
  Widget build(BuildContext context) =>
      BlocBuilder<ShellProfileCubit, ShellProfileState>(
        builder: (context, state) {
          final url = state.avatarUrl;
          final placeholder = Container(
            key: const ValueKey('profile-avatar-placeholder'),
            width: 24,
            height: 24,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Icon(Icons.person_outline_rounded, size: 19),
          );
          if (url == null) return placeholder;
          return ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: Image(
              key: ValueKey((state.userId, state.avatarIdentityKey, url)),
              image: CachedNetworkImageProvider(
                url,
                cacheKey:
                    state.avatarIdentityKey ??
                    avatarIdentityKeyForUrl(url) ??
                    url,
              ),
              width: 24,
              height: 24,
              fit: BoxFit.cover,
              frameBuilder: (context, child, frame, wasSynchronouslyLoaded) =>
                  wasSynchronouslyLoaded || frame != null
                  ? child
                  : const FinanceSkeletonBlock(
                      key: ValueKey('profile-avatar-loading'),
                      width: 24,
                      height: 24,
                      radius: 8,
                    ),
              errorBuilder: (_, error, stack) => placeholder,
            ),
          );
        },
      );
}
