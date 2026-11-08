import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/layout/grouped_rows.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/widgets/create_workspace_dialog.dart';
import 'package:mobile/features/workspace/widgets/workspace_picker_sheet.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';
import 'package:mobile/l10n/l10n.dart';

const _find = 'find';
const _editPins = 'pins';
const _create = 'new';
const _workspacePrefix = 'ws:';

/// The More menu behind Home's chips: the workspaces without a chip, then
/// Find, Edit pinned workspaces (once pins apply and have loaded) and New
/// workspace.
Future<void> showHomeWorkspaceMore(
  BuildContext context, {
  required List<Workspace> workspaces,
  required List<Workspace> shown,
  required List<String> pins,
  required bool canEditPins,
  required Future<List<String>> Function(List<String> pins) onPinsChanged,
}) async {
  final l10n = context.l10n;
  final remaining = [
    for (final workspace in workspaces)
      if (!shown.contains(workspace)) workspace,
  ];
  final choice = await showAppActionSheet<String>(
    context: context,
    title: l10n.homeWorkspaceMore,
    actions: [
      for (final workspace in remaining)
        AppSheetAction(
          key: ValueKey('home-workspace-more-${workspace.id}'),
          value: '$_workspacePrefix${workspace.id}',
          icon: workspace.personal ? LucideIcons.user : LucideIcons.layers,
          label: displayWorkspaceName(context, workspace),
        ),
      AppSheetAction(
        key: const ValueKey('home-workspace-more-find'),
        value: _find,
        icon: LucideIcons.search,
        label: l10n.homeWorkspaceFind,
      ),
      if (canEditPins)
        AppSheetAction(
          key: const ValueKey('home-workspace-more-pins'),
          value: _editPins,
          icon: LucideIcons.pin,
          label: l10n.homeWorkspaceEditPins,
        ),
      AppSheetAction(
        key: const ValueKey('home-workspace-more-new'),
        value: _create,
        icon: LucideIcons.plus,
        tone: AppTone.primary,
        label: l10n.homeWorkspaceNew,
      ),
    ],
  );
  if (choice == null || !context.mounted) return;
  switch (choice) {
    case _find:
      showWorkspacePickerSheet(context);
    case _editPins:
      await showAppSheet<void>(
        context: context,
        size: AppSheetSize.medium,
        builder: (_) => _PinsEditor(
          workspaces: workspaces,
          pins: pins,
          onChanged: onPinsChanged,
        ),
      );
    case _create:
      await showCreateWorkspaceDialog(context);
    default:
      final id = choice.substring(_workspacePrefix.length);
      final workspace = workspaces.where((w) => w.id == id).firstOrNull;
      if (workspace == null) return;
      await context.read<WorkspaceCubit>().selectWorkspace(workspace);
  }
}

class _PinsEditor extends StatefulWidget {
  const _PinsEditor({
    required this.workspaces,
    required this.pins,
    required this.onChanged,
  });

  final List<Workspace> workspaces;
  final List<String> pins;

  /// Saves the pins and resolves with what is persisted afterwards.
  final Future<List<String>> Function(List<String> pins) onChanged;

  @override
  State<_PinsEditor> createState() => _PinsEditorState();
}

class _PinsEditorState extends State<_PinsEditor> {
  late List<String> _pins = [...widget.pins];

  void _toggle(Workspace workspace, {required bool pinned}) {
    setState(() {
      _pins = pinned
          ? [..._pins, workspace.id]
          : [..._pins.where((id) => id != workspace.id)];
    });
    unawaited(_persist(_pins));
  }

  /// A failed save rolls the row back, so the checkboxes follow what is
  /// actually stored rather than the tap.
  Future<void> _persist(List<String> pins) async {
    final persisted = await widget.onChanged(pins);
    if (!mounted || !identical(pins, _pins)) return;
    setState(() => _pins = [...persisted]);
  }

  @override
  Widget build(BuildContext context) => AppSheetScaffold(
    title: context.l10n.homeWorkspacePinsTitle,
    description: context.l10n.homeWorkspacePinsDescription,
    slivers: [
      SliverList.builder(
        itemCount: widget.workspaces.length,
        itemBuilder: (context, index) {
          final workspace = widget.workspaces[index];
          return AppCheckboxRow(
            key: ValueKey('home-workspace-pin-${workspace.id}'),
            title: Text(displayWorkspaceName(context, workspace)),
            value: _pins.contains(workspace.id),
            onChanged: (value) => _toggle(workspace, pinned: value ?? false),
          );
        },
      ),
    ],
  );
}
