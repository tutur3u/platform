import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_state.dart';

class ProfileNavigationAvatar extends StatelessWidget {
  const ProfileNavigationAvatar({super.key});

  @override
  Widget build(BuildContext context) =>
      BlocBuilder<ShellProfileCubit, ShellProfileState>(
        builder: (context, state) {
          final url = state.avatarUrl;
          if (url == null) return const Icon(Icons.person_outline_rounded);
          return ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: Image.network(
              url,
              fit: BoxFit.cover,
              errorBuilder: (_, error, stack) =>
                  const Icon(Icons.person_outline_rounded),
            ),
          );
        },
      );
}
