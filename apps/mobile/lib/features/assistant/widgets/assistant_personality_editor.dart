import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/cubit/assistant_personal_settings_cubit.dart';
import 'package:mobile/features/assistant/view/assistant_settings_editor_page.dart';
import 'package:mobile/features/assistant/widgets/assistant_personality_field_editor.dart';
import 'package:mobile/features/settings/view/settings_scoped_page.dart';
import 'package:mobile/l10n/l10n.dart';

/// The personality route lists individual settings. Each setting has its own
/// editor that merges into the latest freshly confirmed full soul.
class AssistantPersonalityEditor extends StatelessWidget {
  const AssistantPersonalityEditor({
    required this.cubit,
    required this.isScopeCurrent,
    super.key,
  });
  final AssistantPersonalSettingsCubit cubit;
  final bool Function() isScopeCurrent;

  @override
  Widget build(BuildContext context) =>
      BlocBuilder<
        AssistantPersonalSettingsCubit,
        AssistantPersonalSettingsState
      >(
        bloc: cubit,
        builder: (context, state) => ListView(
          padding: const EdgeInsets.symmetric(vertical: 16),
          children: [
            if (state.snapshot == null && state.loading)
              const AppLoadingIndicator.page(),
            if (state.failed) ...[
              Text(context.l10n.assistantPersonalSettingsError),
              AppButton.ghost(
                onPressed: cubit.load,
                child: Text(context.l10n.commonRetry),
              ),
            ],
            if (state.snapshot != null)
              for (final field in AssistantPersonalityField.values)
                AppListTile(
                  key: ValueKey('assistant-personality-${field.name}'),
                  title: Text(field.title(context)),
                  subtitle: Text(
                    field.options(context)[field.value(state.snapshot!.soul)] ??
                        field.value(state.snapshot!.soul),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  trailing: const Icon(LucideIcons.chevronRight),
                  enabled: cubit.admitted && state.canEditSoul,
                  onTap: () => cubit.admitted && cubit.state.canEditSoul
                      ? unawaited(
                          pushScopedSettingsPage(
                            context,
                            builder: (editorContext, isCurrent) =>
                                AssistantSettingsEditorPage(
                                  title: field.title(editorContext),
                                  child: AssistantPersonalityFieldEditor(
                                    cubit: cubit,
                                    field: field,
                                    isScopeCurrent: () =>
                                        isCurrent() && isScopeCurrent(),
                                  ),
                                ),
                          ),
                        )
                      : null,
                ),
          ],
        ),
      );
}
