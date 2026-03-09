import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/data/models/task_estimate_board.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/tasks_estimates/cubit/task_estimates_cubit.dart';
import 'package:mobile/features/tasks_estimates/utils/estimation_type_meta.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class TaskEstimateDialog extends StatefulWidget {
  const TaskEstimateDialog({required this.board, super.key});

  final TaskEstimateBoard board;

  @override
  State<TaskEstimateDialog> createState() => _TaskEstimateDialogState();
}

class _TaskEstimateDialogState extends State<TaskEstimateDialog> {
  late String _selectedEstimationType;
  late bool _extendedEstimation;
  late bool _allowZeroEstimates;
  late bool _countUnestimatedIssues;

  @override
  void initState() {
    super.initState();
    _selectedEstimationType = widget.board.estimationType ?? 'none';
    _extendedEstimation = widget.board.extendedEstimation;
    _allowZeroEstimates = widget.board.allowZeroEstimates;
    _countUnestimatedIssues = widget.board.countUnestimatedIssues;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final state = context.watch<TaskEstimatesCubit>().state;
    final isSaving = state.status == TaskEstimatesStatus.updating;
    final type = estimationTypeMeta(
      context,
      _selectedEstimationType == 'none' ? null : _selectedEstimationType,
    );

    return shad.AlertDialog(
      title: Text(l10n.taskEstimatesDialogTitle(widget.board.name)),
      content: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.6,
        ),
        child: SizedBox(
          width: double.maxFinite,
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  l10n.taskEstimatesDialogEstimationMethod,
                  style: shad.Theme.of(context).typography.small,
                ),
                const shad.Gap(8),
                shad.OutlineButton(
                  onPressed: isSaving ? null : () => _showMethodPicker(context),
                  child: Row(
                    children: [
                      Expanded(child: Text(type.label)),
                      const Icon(Icons.keyboard_arrow_down),
                    ],
                  ),
                ),
                if (_selectedEstimationType != 'none') ...[
                  const shad.Gap(16),
                  Text(
                    l10n.taskEstimatesDialogRangeTitle(type.rangeLabel),
                    style: shad.Theme.of(context).typography.small,
                  ),
                  const shad.Gap(8),
                  _RangeOptionTile(
                    title: l10n.taskEstimatesRangeStandard,
                    description: type.description(isExtended: false),
                    selected: !_extendedEstimation,
                    onTap: isSaving
                        ? null
                        : () => setState(() => _extendedEstimation = false),
                  ),
                  const shad.Gap(8),
                  _RangeOptionTile(
                    title: l10n.taskEstimatesRangeExtended,
                    description: type.description(isExtended: true),
                    selected: _extendedEstimation,
                    onTap: isSaving
                        ? null
                        : () => setState(() => _extendedEstimation = true),
                  ),
                  const shad.Gap(16),
                  Text(
                    l10n.taskEstimatesDialogEstimationOptions,
                    style: shad.Theme.of(context).typography.small,
                  ),
                  const shad.Gap(8),
                  _SwitchTile(
                    title: l10n.taskEstimatesAllowZeroEstimates,
                    description:
                        l10n.taskEstimatesAllowZeroEstimatesDescription,
                    value: _allowZeroEstimates,
                    onChanged: isSaving
                        ? null
                        : (value) =>
                              setState(() => _allowZeroEstimates = value),
                  ),
                  const shad.Gap(8),
                  _SwitchTile(
                    title: l10n.taskEstimatesCountUnestimatedIssues,
                    description:
                        l10n.taskEstimatesCountUnestimatedIssuesDescription,
                    value: _countUnestimatedIssues,
                    onChanged: isSaving
                        ? null
                        : (value) =>
                              setState(() => _countUnestimatedIssues = value),
                  ),
                  const shad.Gap(16),
                  shad.Card(
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            l10n.taskEstimatesDialogSelectedConfiguration,
                            style: shad.Theme.of(context).typography.small
                                .copyWith(
                                  fontWeight: FontWeight.w600,
                                ),
                          ),
                          const shad.Gap(6),
                          Text(
                            type.description(
                              isExtended: _extendedEstimation,
                            ),
                            style: shad.Theme.of(context).typography.textMuted,
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
      actions: [
        shad.OutlineButton(
          onPressed: isSaving ? null : () => Navigator.of(context).pop(),
          child: Text(l10n.commonCancel),
        ),
        shad.PrimaryButton(
          onPressed: isSaving ? null : _save,
          child: isSaving
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: shad.CircularProgressIndicator(),
                )
              : Text(l10n.taskEstimatesDialogSave),
        ),
      ],
    );
  }

  Future<void> _showMethodPicker(BuildContext context) async {
    final selected = await shad.showDialog<String>(
      context: context,
      builder: (dialogContext) {
        final options = estimationTypes(dialogContext, includeNone: true);
        return shad.AlertDialog(
          title: Text(dialogContext.l10n.taskEstimatesDialogEstimationMethod),
          content: SizedBox(
            width: double.maxFinite,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final option in options)
                  shad.GhostButton(
                    onPressed: () =>
                        Navigator.of(dialogContext).pop(option.value),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(option.label),
                          const shad.Gap(4),
                          Text(
                            option.description(isExtended: false),
                            style: shad.Theme.of(
                              dialogContext,
                            ).typography.textMuted,
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
        );
      },
    );

    if (selected == null || !mounted) {
      return;
    }

    setState(() {
      _selectedEstimationType = selected;
      if (selected == 'none') {
        _extendedEstimation = false;
      }
    });
  }

  Future<void> _save() async {
    final currentContext = context;
    final l10n = currentContext.l10n;
    final navigator = Navigator.of(currentContext);
    final rootNavigator = Navigator.of(currentContext, rootNavigator: true);
    final wsId = currentContext
        .read<WorkspaceCubit>()
        .state
        .currentWorkspace
        ?.id;
    if (wsId == null) {
      return;
    }

    final estimatesCubit = currentContext.read<TaskEstimatesCubit>();

    try {
      await estimatesCubit.updateBoardEstimation(
        wsId: wsId,
        boardId: widget.board.id,
        estimationType: _selectedEstimationType == 'none'
            ? null
            : _selectedEstimationType,
        extendedEstimation:
            _selectedEstimationType != 'none' && _extendedEstimation,
        allowZeroEstimates: _allowZeroEstimates,
        countUnestimatedIssues: _countUnestimatedIssues,
      );

      if (!mounted || !navigator.mounted || !rootNavigator.mounted) {
        return;
      }

      navigator.pop();
      shad.showToast(
        context: rootNavigator.context,
        builder: (_, overlay) => shad.Alert(
          content: Text(l10n.taskEstimatesUpdateSuccess),
        ),
      );
    } on ApiException catch (error) {
      if (!mounted || !rootNavigator.mounted) {
        return;
      }
      shad.showToast(
        context: rootNavigator.context,
        builder: (_, overlay) => shad.Alert.destructive(
          title: Text(l10n.commonSomethingWentWrong),
          content: Text(error.message),
        ),
      );
    } on Exception catch (error) {
      if (!mounted || !rootNavigator.mounted) {
        return;
      }
      shad.showToast(
        context: rootNavigator.context,
        builder: (_, overlay) => shad.Alert.destructive(
          title: Text(l10n.commonSomethingWentWrong),
          content: Text(error.toString()),
        ),
      );
    }
  }
}

class _RangeOptionTile extends StatelessWidget {
  const _RangeOptionTile({
    required this.title,
    required this.description,
    required this.selected,
    required this.onTap,
  });

  final String title;
  final String description;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return shad.Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: theme.typography.small.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const shad.Gap(4),
                    Text(description, style: theme.typography.textMuted),
                  ],
                ),
              ),
              const shad.Gap(12),
              Icon(
                selected ? Icons.radio_button_checked : Icons.radio_button_off,
                color: selected
                    ? theme.colorScheme.primary
                    : theme.colorScheme.mutedForeground,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SwitchTile extends StatelessWidget {
  const _SwitchTile({
    required this.title,
    required this.description,
    required this.value,
    required this.onChanged,
  });

  final String title;
  final String description;
  final bool value;
  final ValueChanged<bool>? onChanged;

  @override
  Widget build(BuildContext context) {
    return shad.Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: shad.Theme.of(context).typography.small.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const shad.Gap(4),
                  Text(
                    description,
                    style: shad.Theme.of(context).typography.textMuted,
                  ),
                ],
              ),
            ),
            const shad.Gap(12),
            shad.Switch(value: value, onChanged: onChanged),
          ],
        ),
      ),
    );
  }
}
