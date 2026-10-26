import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/widgets/assistant_credit_source_sheet_body.dart';
import 'package:mobile/l10n/l10n.dart';

class AssistantCreditSourceSheet extends StatelessWidget {
  const AssistantCreditSourceSheet({
    required this.cubit,
    required this.isPersonalWorkspace,
    super.key,
  });

  final AssistantShellCubit cubit;
  final bool isPersonalWorkspace;

  @override
  Widget build(BuildContext context) =>
      BlocBuilder<AssistantShellCubit, AssistantShellState>(
        bloc: cubit,
        builder: (context, state) {
          if (state.status != AssistantShellStatus.loaded) {
            final failed = state.status == AssistantShellStatus.error;
            return AppSheetScaffold(
              title: context.l10n.assistantSourceLabel,
              child: AppGroupedCard(
                children: [
                  if (failed)
                    AppStateMessage.inline(
                      icon: LucideIcons.cloudOff,
                      tone: AppTone.destructive,
                      title: context.l10n.assistantCreditsUnavailable,
                      actionLabel: state.workspace == null
                          ? null
                          : context.l10n.commonRetry,
                      onAction: state.workspace == null
                          ? null
                          : () => cubit.loadWorkspace(
                              state.workspace!,
                              forceRefresh: true,
                            ),
                    )
                  else
                    Semantics(
                      label: context.l10n.commonLoading,
                      child: const AppSkeletonRows(),
                    ),
                ],
              ),
            );
          }
          return AssistantCreditSourceSheetBody(
            shellState: state,
            isPersonalWorkspace: isPersonalWorkspace,
            onClose: () => Navigator.of(context).pop(),
            onSelect: (source) async {
              final selected = await cubit.setCreditSource(source);
              if (context.mounted && selected) Navigator.of(context).pop();
            },
          );
        },
      );
}
