import 'package:flutter/material.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/l10n/l10n.dart';

class AssistantModelPicker extends StatelessWidget {
  const AssistantModelPicker({
    required this.selected,
    required this.models,
    required this.allowedModels,
    required this.onSelected,
    super.key,
  });

  final AssistantGatewayModel selected;
  final List<AssistantGatewayModel> models;
  final List<String> allowedModels;
  final Future<void> Function(AssistantGatewayModel) onSelected;

  bool _isAllowed(AssistantGatewayModel model) {
    if (model.disabled) return false;
    if (allowedModels.isEmpty) return true;
    final bare = model.value.split('/').last;
    return allowedModels.contains(model.value) || allowedModels.contains(bare);
  }

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
                builder: (_) => _ModelPickerSheet(
                  selected: selected,
                  models: models,
                  isAllowed: _isAllowed,
                ),
              );
              if (choice != null) await onSelected(choice);
            },
    );
  }
}

class _ModelPickerSheet extends StatefulWidget {
  const _ModelPickerSheet({
    required this.selected,
    required this.models,
    required this.isAllowed,
  });

  final AssistantGatewayModel selected;
  final List<AssistantGatewayModel> models;
  final bool Function(AssistantGatewayModel) isAllowed;

  @override
  State<_ModelPickerSheet> createState() => _ModelPickerSheetState();
}

class _ModelPickerSheetState extends State<_ModelPickerSheet> {
  final _search = TextEditingController();

  @override
  void initState() {
    super.initState();
    _search.addListener(_refresh);
  }

  void _refresh() => setState(() {});

  @override
  void dispose() {
    _search.removeListener(_refresh);
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final query = _search.text.trim().toLowerCase();
    final visible =
        widget.models
            .where(
              (model) =>
                  '${model.provider} ${model.label} ${model.description ?? ''}'
                      .toLowerCase()
                      .contains(query),
            )
            .toList()
          ..sort((a, b) {
            final provider = a.provider.compareTo(b.provider);
            return provider != 0 ? provider : a.label.compareTo(b.label);
          });
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: SizedBox(
          height: MediaQuery.sizeOf(context).height * 0.68,
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 4, 20, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      context.l10n.assistantModelLabel,
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _search,
                      decoration: InputDecoration(
                        prefixIcon: const Icon(Icons.search_rounded),
                        hintText: context.l10n.assistantSearchModels,
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: ListView.builder(
                  itemCount: visible.length,
                  itemBuilder: (context, index) {
                    final model = visible[index];
                    final enabled = widget.isAllowed(model);
                    return ListTile(
                      enabled: enabled,
                      selected: model.value == widget.selected.value,
                      leading: const Icon(Icons.auto_awesome_outlined),
                      title: Text(model.label),
                      subtitle: Text(
                        [
                          model.provider,
                          if (model.description case final description?)
                            description,
                        ].join(' · '),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      trailing: model.value == widget.selected.value
                          ? const Icon(Icons.check_rounded)
                          : null,
                      onTap: enabled
                          ? () => Navigator.of(context).pop(model)
                          : null,
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
