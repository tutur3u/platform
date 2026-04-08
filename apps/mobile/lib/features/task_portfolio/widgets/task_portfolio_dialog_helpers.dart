part of 'task_portfolio_dialogs.dart';

const List<String> _projectStatuses = [
  'active',
  'backlog',
  'planned',
  'in_progress',
  'in_review',
  'in_testing',
  'completed',
  'cancelled',
  'on_hold',
];

const List<String> _projectPriorities = ['critical', 'high', 'normal', 'low'];
const List<String> _projectHealthStatuses = [
  'on_track',
  'at_risk',
  'off_track',
];
const List<String> _initiativeStatuses = [
  'active',
  'completed',
  'on_hold',
  'cancelled',
];

String? _normalizeDescription(String value) {
  final trimmed = value.trim();
  return trimmed.isEmpty ? null : trimmed;
}

String _projectStatusLabel(BuildContext context, String value) {
  return switch (value) {
    'backlog' => context.l10n.taskPortfolioProjectStatusBacklog,
    'planned' => context.l10n.taskPortfolioProjectStatusPlanned,
    'in_progress' => context.l10n.taskPortfolioProjectStatusInProgress,
    'in_review' => context.l10n.taskPortfolioProjectStatusInReview,
    'in_testing' => context.l10n.taskPortfolioProjectStatusInTesting,
    'completed' => context.l10n.taskPortfolioProjectStatusCompleted,
    'cancelled' => context.l10n.taskPortfolioProjectStatusCancelled,
    'on_hold' => context.l10n.taskPortfolioProjectStatusOnHold,
    _ => context.l10n.taskPortfolioProjectStatusActive,
  };
}

String _projectPriorityLabel(BuildContext context, String value) {
  return switch (value) {
    'critical' => context.l10n.taskPortfolioProjectPriorityCritical,
    'high' => context.l10n.taskPortfolioProjectPriorityHigh,
    'low' => context.l10n.taskPortfolioProjectPriorityLow,
    _ => context.l10n.taskPortfolioProjectPriorityNormal,
  };
}

String _projectHealthStatusLabel(BuildContext context, String value) {
  return switch (value) {
    'at_risk' => context.l10n.taskPortfolioProjectHealthAtRisk,
    'off_track' => context.l10n.taskPortfolioProjectHealthOffTrack,
    _ => context.l10n.taskPortfolioProjectHealthOnTrack,
  };
}

String _initiativeStatusLabel(BuildContext context, String value) {
  return switch (value) {
    'completed' => context.l10n.taskPortfolioInitiativeStatusCompleted,
    'on_hold' => context.l10n.taskPortfolioInitiativeStatusOnHold,
    'cancelled' => context.l10n.taskPortfolioInitiativeStatusCancelled,
    _ => context.l10n.taskPortfolioInitiativeStatusActive,
  };
}

Future<DateTime?> _pickDate(
  BuildContext context, {
  DateTime? initialDate,
  DateTime? firstDate,
}) {
  final now = DateTime.now();
  final effectiveInitial = initialDate ?? firstDate ?? now;
  final effectiveFirst = firstDate ?? DateTime(now.year - 10);
  final effectiveLast = DateTime(now.year + 10, 12, 31);
  final boundedInitial = effectiveInitial.isBefore(effectiveFirst)
      ? effectiveFirst
      : effectiveInitial.isAfter(effectiveLast)
      ? effectiveLast
      : effectiveInitial;

  return showDatePicker(
    context: context,
    initialDate: boundedInitial,
    firstDate: effectiveFirst,
    lastDate: effectiveLast,
  );
}

class _DateField extends StatelessWidget {
  const _DateField({
    required this.label,
    required this.value,
    required this.onPick,
    this.onClear,
  });

  final String label;
  final DateTime? value;
  final VoidCallback onPick;
  final VoidCallback? onClear;

  @override
  Widget build(BuildContext context) {
    final formatted = value == null ? null : DateFormat.yMMMd().format(value!);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _FieldLabel(label),
        const shad.Gap(4),
        Row(
          children: [
            Expanded(
              child: shad.OutlineButton(
                onPressed: onPick,
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        formatted ?? context.l10n.taskPortfolioPickDate,
                        textAlign: TextAlign.left,
                      ),
                    ),
                    const Icon(Icons.calendar_today_outlined, size: 16),
                  ],
                ),
              ),
            ),
            if (onClear != null) ...[
              const shad.Gap(8),
              shad.GhostButton(
                onPressed: onClear,
                child: Text(context.l10n.taskPortfolioClearSelection),
              ),
            ],
          ],
        ),
      ],
    );
  }
}

class _FieldLabel extends StatelessWidget {
  const _FieldLabel(this.label);

  final String label;

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: shad.Theme.of(
        context,
      ).typography.small.copyWith(fontWeight: FontWeight.w500),
    );
  }
}

class _DropdownSelectField extends StatelessWidget {
  const _DropdownSelectField({
    required this.value,
    required this.values,
    required this.placeholder,
    required this.title,
    required this.labelBuilder,
    required this.onChanged,
    this.fieldKey,
  });

  final String? value;
  final List<String> values;
  final String placeholder;
  final String title;
  final String Function(String value) labelBuilder;
  final ValueChanged<String?> onChanged;
  final Key? fieldKey;

  @override
  Widget build(BuildContext context) {
    final hasValue = value != null && values.contains(value);
    final selectedLabel = hasValue ? labelBuilder(value!) : placeholder;

    return shad.OutlineButton(
      key: fieldKey ?? ValueKey('${placeholder}_${value ?? 'empty'}'),
      onPressed: () => unawaited(_openPicker(context)),
      child: Row(
        children: [
          Expanded(
            child: Text(
              selectedLabel,
              textAlign: TextAlign.left,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          const shad.Gap(8),
          const Icon(Icons.keyboard_arrow_down, size: 16),
        ],
      ),
    );
  }

  Future<void> _openPicker(BuildContext context) async {
    final selected = await showAdaptiveSheet<String>(
      context: context,
      backgroundColor: shad.Theme.of(context).colorScheme.background,
      builder: (_) => _SingleSelectPickerSheet(
        title: title,
        values: values,
        selectedValue: value,
        labelBuilder: labelBuilder,
      ),
    );

    if (selected != null) {
      onChanged(selected);
    }
  }
}

class _SingleSelectPickerSheet extends StatelessWidget {
  const _SingleSelectPickerSheet({
    required this.title,
    required this.values,
    required this.selectedValue,
    required this.labelBuilder,
  });

  final String title;
  final List<String> values;
  final String? selectedValue;
  final String Function(String value) labelBuilder;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;

    return SafeArea(
      top: false,
      child: Padding(
        padding: EdgeInsets.fromLTRB(16, 12, 16, 20 + bottomInset),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: theme.colorScheme.mutedForeground.withValues(
                    alpha: 0.3,
                  ),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const shad.Gap(16),
            Text(title, style: theme.typography.h4),
            const shad.Gap(12),
            ConstrainedBox(
              constraints: BoxConstraints(
                maxHeight: MediaQuery.sizeOf(context).height * 0.5,
              ),
              child: ListView.builder(
                shrinkWrap: true,
                itemCount: values.length,
                itemBuilder: (context, index) {
                  final item = values[index];
                  final isSelected = item == selectedValue;
                  return ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: isSelected
                        ? const Icon(Icons.check, size: 16)
                        : const SizedBox(width: 16, height: 16),
                    title: Text(labelBuilder(item)),
                    onTap: () => Navigator.of(context).pop(item),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
