import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/assistant/cubit/assistant_personal_settings_cubit.dart';
import 'package:mobile/features/assistant/view/assistant_settings_editor_page.dart';
import 'package:mobile/features/assistant/widgets/assistant_personality_field_editor.dart';
import 'package:mobile/features/settings/view/settings_scoped_page.dart';

/// The personality route lists individual settings. Each setting has its own
/// editor and writes only that field against the latest confirmed soul.
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
            for (final field in AssistantPersonalityField.values)
              ListTile(
                key: ValueKey('assistant-personality-${field.name}'),
                title: Text(field.title(context)),
                subtitle: Text(
                  field.options(context)[field.value(state.snapshot!.soul)] ??
                      field.value(state.snapshot!.soul),
                ),
                trailing: const Icon(Icons.chevron_right),
                enabled: !state.busy,
                onTap: () => unawaited(
                  pushScopedSettingsPage(
                    context,
                    rootNavigator: true,
                    builder: (_, isCurrent) => AssistantSettingsEditorPage(
                      title: field.title(context),
                      child: AssistantPersonalityFieldEditor(
                        cubit: cubit,
                        field: field,
                        isScopeCurrent: () => isCurrent() && isScopeCurrent(),
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      );
}
