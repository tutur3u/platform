import 'package:flutter/material.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/models/assistant_model_eligibility.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_model_picker_sheet.dart';
import 'package:mobile/l10n/l10n.dart';

class AssistantModelPicker extends StatelessWidget {
  const AssistantModelPicker({
    required this.selected,
    required this.models,
    required this.allowedModels,
    required this.onSelected,
    this.repository,
    this.workspaceId,
    super.key,
  });

  final AssistantGatewayModel selected;
  final List<AssistantGatewayModel> models;
  final List<String> allowedModels;
  final Future<void> Function(AssistantGatewayModel) onSelected;
  final AssistantRepository? repository;
  final String? workspaceId;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      tooltip: '${context.l10n.assistantModelLabel}: ${selected.label}',
      visualDensity: VisualDensity.compact,
      constraints: const BoxConstraints.tightFor(width: 34, height: 34),
      padding: EdgeInsets.zero,
      icon: const Icon(Icons.auto_awesome_outlined, size: 18),
      onPressed: models.isEmpty
          ? null
          : () async {
              final choice = await showModalBottomSheet<AssistantGatewayModel>(
                context: context,
                showDragHandle: true,
                isScrollControlled: true,
                builder: (_) => AssistantModelPickerSheet(
                  selected: selected,
                  models: models,
                  isAllowed: (model) =>
                      isAssistantModelAllowed(model, allowedModels),
                  repository: repository,
                  workspaceId: workspaceId,
                ),
              );
              if (choice != null) await onSelected(choice);
            },
    );
  }
}
