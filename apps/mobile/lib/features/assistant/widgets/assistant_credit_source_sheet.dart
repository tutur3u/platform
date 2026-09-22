import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/widgets/assistant_credit_source_sheet_body.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

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
            return SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Align(
                      alignment: Alignment.centerRight,
                      child: CloseButton(
                        onPressed: () => Navigator.of(context).pop(),
                      ),
                    ),
                    if (failed) ...[
                      Text(context.l10n.assistantCreditsUnavailable),
                      TextButton(
                        onPressed: state.workspace == null
                            ? null
                            : () => cubit.loadWorkspace(
                                state.workspace!,
                                forceRefresh: true,
                              ),
                        child: Text(context.l10n.commonRetry),
                      ),
                    ] else
                      const NovaLoadingIndicator(),
                  ],
                ),
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
