import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/layout/layout.dart';
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

  void _open(BuildContext context, AssistantPersonalityField field) {
    if (!cubit.admitted || !cubit.state.canEditSoul) return;
    unawaited(
      pushScopedSettingsPage(
        context,
        builder: (editorContext, isCurrent) => AssistantSettingsEditorPage(
          title: field.title(editorContext),
          child: AssistantPersonalityFieldEditor(
            cubit: cubit,
            field: field,
            isScopeCurrent: () => isCurrent() && isScopeCurrent(),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) =>
      BlocBuilder<
        AssistantPersonalSettingsCubit,
        AssistantPersonalSettingsState
      >(
        bloc: cubit,
        builder: (context, state) {
          final snapshot = state.snapshot;
          final editable = cubit.admitted && state.canEditSoul;
          return AppPageListView(
            children: [
              if (snapshot == null && state.loading)
                const AppGroupedSection(children: [AppSkeletonRows(count: 5)]),
              if (state.failed)
                Padding(
                  padding: const EdgeInsets.only(bottom: AppLayout.sectionGap),
                  child: AppGroupedCard(
                    children: [
                      AppStateMessage.inline(
                        icon: LucideIcons.triangleAlert,
                        tone: AppTone.destructive,
                        title: context.l10n.assistantPersonalSettingsError,
                        actionLabel: context.l10n.commonRetry,
                        onAction: cubit.load,
                      ),
                    ],
                  ),
                ),
              if (snapshot != null)
                AppGroupedSection(
                  dividerInset: AppLayout.rowHorizontalPadding,
                  children: [
                    for (final field in AssistantPersonalityField.values)
                      _FieldRow(
                        key: ValueKey('assistant-personality-${field.name}'),
                        title: field.title(context),
                        value:
                            field.options(context)[field.value(
                              snapshot.soul,
                            )] ??
                            field.value(snapshot.soul),
                        onTap: editable ? () => _open(context, field) : null,
                      ),
                  ],
                ),
            ],
          );
        },
      );
}

class _FieldRow extends StatelessWidget {
  const _FieldRow({
    required this.title,
    required this.value,
    required this.onTap,
    super.key,
  });

  final String title;
  final String value;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => AppGroupedRow(
    title: Text(title),
    subtitle: value.trim().isEmpty
        ? null
        : Text(value, maxLines: 2, overflow: TextOverflow.ellipsis),
    showChevron: onTap != null,
    onTap: onTap,
  );
}
