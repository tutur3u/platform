import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet_access/data/fleet_access_models.dart';
import 'package:mobile/features/mastermind/fleet_access/data/fleet_intent_draft.dart';
import 'package:mobile/features/mastermind/fleet_access/view/fleet_access_labels.dart';
import 'package:mobile/l10n/l10n.dart';

/// The request form's fields: the kind and project, then only the fields
/// that kind sends, then the note.
class FleetRequestFields extends StatefulWidget {
  const FleetRequestFields({
    required this.draft,
    required this.kinds,
    required this.projects,
    required this.errors,
    required this.onChanged,
    this.enabled = true,
    super.key,
  });

  final FleetIntentDraft draft;
  final List<FleetIntentKind> kinds;
  final List<String> projects;
  final Map<FleetDraftField, FleetDraftError> errors;

  /// Applies a change to the form's current draft, so a change never
  /// starts from a draft an earlier change already replaced.
  final void Function(FleetIntentDraft Function(FleetIntentDraft draft) change)
  onChanged;
  final bool enabled;

  @override
  State<FleetRequestFields> createState() => _FleetRequestFieldsState();
}

class _FleetRequestFieldsState extends State<FleetRequestFields> {
  late final _target = TextEditingController(text: widget.draft.targetKey);
  late final _commit = TextEditingController(text: widget.draft.commitSha);
  late final _quote = TextEditingController(text: widget.draft.quote);

  @override
  void dispose() {
    _target.dispose();
    _commit.dispose();
    _quote.dispose();
    super.dispose();
  }

  String? _error(FleetDraftField field) {
    final error = widget.errors[field];
    if (error == null) return null;
    final l10n = context.l10n;
    return switch ((field, error)) {
      (_, FleetDraftError.required) => l10n.mastermindFleetAccessErrorRequired,
      (_, FleetDraftError.tooLong) =>
        l10n.mastermindFleetAccessErrorQuoteTooLong,
      (FleetDraftField.commitSha, _) => l10n.mastermindFleetAccessErrorCommit,
      (_, FleetDraftError.invalid) => l10n.mastermindFleetAccessErrorTarget,
    };
  }

  Widget _select<T>({
    required FleetDraftField? field,
    required String label,
    required List<T> values,
    required T? value,
    required String Function(T) labelOf,
    required ValueChanged<T> onChanged,
  }) {
    final tokens = AppTokens.of(context);
    final error = field == null ? null : _error(field);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: AppSpacing.xs,
      children: [
        Text(label, style: tokens.typography.small),
        AppSelect<T>(
          key: ValueKey('fleet-access-field-${field?.name ?? 'kind'}'),
          title: label,
          placeholder: context.l10n.mastermindFleetAccessChoose,
          value: value,
          options: [
            for (final v in values)
              AppSelectOption(value: v, label: labelOf(v)),
          ],
          onChanged: widget.enabled ? onChanged : null,
        ),
        if (error != null)
          Text(
            error,
            style: tokens.typography.xSmall.copyWith(
              color: tokens.colorScheme.destructive,
            ),
          ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final draft = widget.draft;
    final fields = draft.kind.fields;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: AppSpacing.lg,
      children: [
        _select<FleetIntentKind>(
          field: null,
          label: l10n.mastermindFleetAccessFieldKind,
          values: widget.kinds,
          value: draft.kind,
          labelOf: (k) => k.label(l10n),
          onChanged: (k) => widget.onChanged((d) => d.copyWith(kind: k)),
        ),
        _select<String>(
          field: FleetDraftField.project,
          label: l10n.mastermindFleetAccessFieldProject,
          values: widget.projects,
          value: draft.projectKey,
          labelOf: (p) => p,
          onChanged: (p) => widget.onChanged((d) => d.copyWith(projectKey: p)),
        ),
        if (fields.contains(FleetDraftField.topic))
          _select<FleetTopic>(
            field: FleetDraftField.topic,
            label: l10n.mastermindFleetAccessFieldTopic,
            values: FleetTopic.values,
            value: draft.topic,
            labelOf: l10n.topic,
            onChanged: (t) => widget.onChanged((d) => d.copyWith(topic: t)),
          ),
        if (fields.contains(FleetDraftField.target))
          AppTextField(
            key: const ValueKey('fleet-access-field-target'),
            controller: _target,
            enabled: widget.enabled,
            label: l10n.mastermindFleetAccessFieldTarget,
            placeholder: l10n.mastermindFleetAccessFieldTargetPlaceholder,
            errorText: _error(FleetDraftField.target),
            onChanged: (v) => widget.onChanged((d) => d.copyWith(targetKey: v)),
          ),
        if (fields.contains(FleetDraftField.priority))
          _select<FleetPriority>(
            field: FleetDraftField.priority,
            label: l10n.mastermindFleetAccessFieldPriority,
            values: FleetPriority.values,
            value: draft.priority,
            labelOf: l10n.priority,
            onChanged: (p) => widget.onChanged((d) => d.copyWith(priority: p)),
          ),
        if (fields.contains(FleetDraftField.template))
          _select<FleetWorkTemplate>(
            field: FleetDraftField.template,
            label: l10n.mastermindFleetAccessFieldTemplate,
            values: FleetWorkTemplate.values,
            value: draft.template,
            labelOf: l10n.template,
            onChanged: (t) => widget.onChanged((d) => d.copyWith(template: t)),
          ),
        if (fields.contains(FleetDraftField.objective))
          _select<FleetObjective>(
            field: FleetDraftField.objective,
            label: l10n.mastermindFleetAccessFieldObjective,
            values: FleetObjective.values,
            value: draft.objective,
            labelOf: l10n.objective,
            onChanged: (o) => widget.onChanged((d) => d.copyWith(objective: o)),
          ),
        if (fields.contains(FleetDraftField.environment))
          _select<FleetEnvironment>(
            field: FleetDraftField.environment,
            label: l10n.mastermindFleetAccessFieldEnvironment,
            values: FleetEnvironment.values,
            value: draft.environment,
            labelOf: l10n.environment,
            onChanged: (e) =>
                widget.onChanged((d) => d.copyWith(environment: e)),
          ),
        if (fields.contains(FleetDraftField.commitSha))
          AppTextField(
            key: const ValueKey('fleet-access-field-commit'),
            controller: _commit,
            enabled: widget.enabled,
            label: l10n.mastermindFleetAccessFieldCommit,
            placeholder: l10n.mastermindFleetAccessFieldCommitPlaceholder,
            errorText: _error(FleetDraftField.commitSha),
            onChanged: (v) => widget.onChanged((d) => d.copyWith(commitSha: v)),
          ),
        AppTextField(
          key: const ValueKey('fleet-access-field-quote'),
          controller: _quote,
          enabled: widget.enabled,
          label: l10n.mastermindFleetAccessFieldQuote,
          placeholder: l10n.mastermindFleetAccessFieldQuotePlaceholder,
          errorText: _error(FleetDraftField.quote),
          minLines: 3,
          maxLines: 6,
          onChanged: (v) => widget.onChanged((d) => d.copyWith(quote: v)),
        ),
      ],
    );
  }
}
