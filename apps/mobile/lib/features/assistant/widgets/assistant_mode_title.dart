import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/assistant/cubit/assistant_chrome_cubit.dart';
import 'package:mobile/features/assistant/widgets/assistant_header_status_chip.dart';
import 'package:mobile/features/assistant/widgets/assistant_name_dialog.dart';
import 'package:mobile/features/shell/cubit/shell_title_override_cubit.dart';
import 'package:mobile/features/shell/view/readable_shell_title.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/l10n/l10n.dart';

/// The mode name stays stable while the shared shell switches views.
class AssistantModeTitle extends StatelessWidget {
  const AssistantModeTitle({super.key});

  @override
  Widget build(BuildContext context) {
    final overrides = lookupShellTitleOverrideCubit(context);
    if (overrides == null) return _content(context, null);
    return BlocBuilder<ShellTitleOverrideCubit, ShellTitleOverrideState>(
      bloc: overrides,
      builder: (context, state) =>
          _content(context, state.registrationForLocation(Routes.assistant)),
    );
  }

  Widget _content(
    BuildContext context,
    ShellTitleOverrideRegistration? registration,
  ) {
    return BlocBuilder<AssistantChromeCubit, AssistantChromeState>(
      builder: (context, chrome) =>
          _title(context, registration, chrome.isLiveMode),
    );
  }

  Widget _title(
    BuildContext context,
    ShellTitleOverrideRegistration? registration,
    bool isLiveMode,
  ) {
    final theme = Theme.of(context);
    final title = registration?.title.trim().isNotEmpty == true
        ? registration!.title
        : 'Mira';
    final status = !isLiveMode ? registration?.subtitle : null;
    Widget titleRow({bool folded = false}) => Row(
      children: [
        Image.asset('assets/logos/transparent.png', width: 28, height: 28),
        const SizedBox(width: 10),
        Flexible(
          child: ReadableShellTitle(
            title,
            style: theme.textTheme.titleLarge?.copyWith(
              color: folded
                  ? theme.colorScheme.onPrimaryContainer
                  : theme.colorScheme.onSurface,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        if (status != null && !folded) ...[
          const SizedBox(width: 8),
          AssistantHeaderStatusChip(
            label: status,
            onPressed: registration?.onSubtitlePressed,
          ),
        ],
      ],
    );
    if (registration?.canEditTitle ?? false) {
      final captured = registration!;
      final overrides = lookupShellTitleOverrideCubit(context)!;
      bool current() =>
          context.mounted &&
          !overrides.isClosed &&
          overrides.state
                  .registrationForLocation(Routes.assistant)
                  ?.canEditTitle ==
              true &&
          overrides.state
                  .registrationForLocation(Routes.assistant)
                  ?.titleActionToken ==
              captured.titleActionToken;
      return SizedBox(
        height: 48,
        child: Row(
          children: [
            Expanded(
              child: Tooltip(
                message: context.l10n.assistantRenameTitle,
                child: TextButton(
                  key: const ValueKey('assistant-name-title'),
                  style: TextButton.styleFrom(
                    padding: EdgeInsets.zero,
                    alignment: Alignment.centerLeft,
                  ),
                  onPressed: () {
                    if (!current()) return;
                    final latest = overrides.state.registrationForLocation(
                      Routes.assistant,
                    )!;
                    unawaited(
                      showDialog<void>(
                        context: context,
                        builder: (_) => AssistantNameDialog(
                          name: title,
                          onSubmit: latest.onTitleSubmitted!,
                          isCurrent: current,
                          scopeChanges: overrides.stream,
                        ),
                      ),
                    );
                  },
                  child: Row(
                    children: [
                      Image.asset(
                        'assets/logos/transparent.png',
                        width: 28,
                        height: 28,
                      ),
                      const SizedBox(width: 10),
                      Flexible(
                        child: ReadableShellTitle(
                          title,
                          style: theme.textTheme.titleLarge?.copyWith(
                            color: theme.colorScheme.onSurface,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            if (status != null) ...[
              const SizedBox(width: 4),
              SizedBox.square(
                dimension: 48,
                child: AssistantHeaderStatusChip(
                  label: status,
                  onPressed: registration.onSubtitlePressed,
                  child: const Icon(Icons.memory_rounded, size: 20),
                ),
              ),
            ],
          ],
        ),
      );
    }
    return SizedBox(
      height: 48,
      child: LayoutBuilder(
        builder: (context, constraints) {
          // Action rails leave far less room than the viewport width. Keep the
          // original logo/title budget and make that whole area the recovery target.
          if (status != null && constraints.maxWidth < 220) {
            return AssistantHeaderStatusChip(
              label: status,
              onPressed: registration?.onSubtitlePressed,
              child: SizedBox(
                width: constraints.maxWidth,
                child: titleRow(folded: true),
              ),
            );
          }
          return titleRow();
        },
      ),
    );
  }
}
