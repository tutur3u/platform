import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/shell/view/mobile_section_app_bar.dart';
import 'package:mobile/features/shell/view/shell_chrome_config.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/widgets/workspace_picker_sheet.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class ShellTopBarTitle extends StatelessWidget {
  const ShellTopBarTitle({required this.matchedLocation, super.key});

  final String matchedLocation;

  @override
  Widget build(BuildContext context) {
    final config = ShellChromeConfig.forLocation(context, matchedLocation);

    return SizedBox(
      height: mobileSectionAppBarHeight,
      child: Row(
        children: [
          Image.asset(
            'assets/logos/transparent.png',
            width: mobileSectionAppBarLogoSize,
            height: mobileSectionAppBarLogoSize,
            fit: BoxFit.contain,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Align(
              alignment: Alignment.centerLeft,
              child: config.title == context.l10n.navHome
                  ? const _HomeBreadcrumbTitle()
                  : _AnimatedTitleText(title: config.title),
            ),
          ),
        ],
      ),
    );
  }
}

class _AnimatedTitleText extends StatelessWidget {
  const _AnimatedTitleText({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 220),
      switchInCurve: Curves.easeOutCubic,
      switchOutCurve: Curves.easeInCubic,
      layoutBuilder: (currentChild, previousChildren) => Stack(
        alignment: Alignment.centerLeft,
        children: [
          ...previousChildren,
          if (currentChild != null) currentChild,
        ],
      ),
      transitionBuilder: (child, animation) {
        final offsetAnimation = Tween<Offset>(
          begin: const Offset(0, 0.12),
          end: Offset.zero,
        ).animate(animation);
        return FadeTransition(
          opacity: animation,
          child: SlideTransition(position: offsetAnimation, child: child),
        );
      },
      child: Text(
        title,
        key: ValueKey<String>(title),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: theme.typography.large.copyWith(
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _HomeBreadcrumbTitle extends StatelessWidget {
  const _HomeBreadcrumbTitle();

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return BlocBuilder<WorkspaceCubit, WorkspaceState>(
      buildWhen: (previous, current) =>
          previous.currentWorkspace != current.currentWorkspace,
      builder: (context, state) {
        final workspaceLabel = displayWorkspaceNameOrFallback(
          context,
          state.currentWorkspace,
        );

        return AnimatedSwitcher(
          duration: const Duration(milliseconds: 220),
          switchInCurve: Curves.easeOutCubic,
          switchOutCurve: Curves.easeInCubic,
          layoutBuilder: (currentChild, previousChildren) => Stack(
            alignment: Alignment.centerLeft,
            children: [
              ...previousChildren,
              if (currentChild != null) currentChild,
            ],
          ),
          transitionBuilder: (child, animation) {
            final offsetAnimation = Tween<Offset>(
              begin: const Offset(0, 0.12),
              end: Offset.zero,
            ).animate(animation);
            return FadeTransition(
              opacity: animation,
              child: SlideTransition(position: offsetAnimation, child: child),
            );
          },
          child: Material(
            key: ValueKey<String>(workspaceLabel),
            color: Colors.transparent,
            child: InkWell(
              borderRadius: BorderRadius.circular(14),
              onTap: () => showWorkspacePickerSheet(context),
              child: Ink(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 7,
                ),
                decoration: BoxDecoration(
                  color: theme.colorScheme.muted.withValues(alpha: 0.72),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Flexible(
                      child: Text(
                        workspaceLabel,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.typography.p.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    const SizedBox(width: 4),
                    Icon(
                      Icons.keyboard_arrow_down_rounded,
                      size: 18,
                      color: theme.colorScheme.mutedForeground,
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}
