part of 'shell_page.dart';

class _ShellTrailingActions extends StatelessWidget {
  const _ShellTrailingActions({required this.matchedLocation});

  final String matchedLocation;

  @override
  Widget build(BuildContext context) {
    final titleOverrideCubit = lookupShellTitleOverrideCubit(context);
    if (titleOverrideCubit == null) {
      return _buildActions();
    }

    return BlocBuilder<ShellTitleOverrideCubit, ShellTitleOverrideState>(
      bloc: titleOverrideCubit,
      buildWhen: (previous, current) =>
          previous.showAvatarForLocation(matchedLocation) !=
          current.showAvatarForLocation(matchedLocation),
      builder: (context, state) {
        if (!state.showAvatarForLocation(matchedLocation)) {
          return const SizedBox.shrink();
        }

        return _buildActions();
      },
    );
  }

  Widget _buildActions() {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        ShellInjectedActionsHost(
          matchedLocation: matchedLocation,
          includeNotifications: true,
        ),
        const SizedBox(width: 6),
        _ShellAvatarSlot(matchedLocation: matchedLocation),
      ],
    );
  }
}

class _ShellAvatarSlot extends StatelessWidget {
  const _ShellAvatarSlot({required this.matchedLocation});

  final String matchedLocation;

  @override
  Widget build(BuildContext context) {
    final titleOverrideCubit = lookupShellTitleOverrideCubit(context);
    if (titleOverrideCubit == null) {
      return const KeyedSubtree(
        key: _ShellPageState._shellAvatarKey,
        child: RepaintBoundary(child: AvatarDropdown()),
      );
    }

    return BlocBuilder<ShellTitleOverrideCubit, ShellTitleOverrideState>(
      bloc: titleOverrideCubit,
      buildWhen: (previous, current) =>
          previous.showAvatarForLocation(matchedLocation) !=
          current.showAvatarForLocation(matchedLocation),
      builder: (context, state) {
        if (!state.showAvatarForLocation(matchedLocation)) {
          return const SizedBox.shrink();
        }

        return const KeyedSubtree(
          key: _ShellPageState._shellAvatarKey,
          child: RepaintBoundary(child: AvatarDropdown()),
        );
      },
    );
  }
}
