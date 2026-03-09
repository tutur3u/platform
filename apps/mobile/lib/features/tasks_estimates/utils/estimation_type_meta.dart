import 'package:flutter/widgets.dart';
import 'package:mobile/l10n/l10n.dart';

class EstimationTypeMeta {
  const EstimationTypeMeta({
    required this.value,
    required this.label,
    required this.rangeLabel,
    required this.standardDescription,
    required this.extendedDescription,
  });

  final String value;
  final String label;
  final String rangeLabel;
  final String standardDescription;
  final String extendedDescription;

  String description({required bool isExtended}) =>
      isExtended ? extendedDescription : standardDescription;
}

List<EstimationTypeMeta> estimationTypes(
  BuildContext context, {
  bool includeNone = false,
}) {
  final l10n = context.l10n;
  return [
    if (includeNone)
      EstimationTypeMeta(
        value: 'none',
        label: l10n.taskEstimatesTypeNoneLabel,
        rangeLabel: l10n.taskEstimatesTypeNoneLabel,
        standardDescription: l10n.taskEstimatesTypeNoneDescription,
        extendedDescription: l10n.taskEstimatesTypeNoneDescription,
      ),
    EstimationTypeMeta(
      value: 'fibonacci',
      label: l10n.taskEstimatesTypeFibonacciLabel,
      rangeLabel: l10n.taskEstimatesTypeFibonacciLabel,
      standardDescription: l10n.taskEstimatesTypeFibonacciStandard,
      extendedDescription: l10n.taskEstimatesTypeFibonacciExtended,
    ),
    EstimationTypeMeta(
      value: 'linear',
      label: l10n.taskEstimatesTypeLinearLabel,
      rangeLabel: l10n.taskEstimatesTypeLinearLabel,
      standardDescription: l10n.taskEstimatesTypeLinearStandard,
      extendedDescription: l10n.taskEstimatesTypeLinearExtended,
    ),
    EstimationTypeMeta(
      value: 'exponential',
      label: l10n.taskEstimatesTypeExponentialLabel,
      rangeLabel: l10n.taskEstimatesTypeExponentialLabel,
      standardDescription: l10n.taskEstimatesTypeExponentialStandard,
      extendedDescription: l10n.taskEstimatesTypeExponentialExtended,
    ),
    EstimationTypeMeta(
      value: 't-shirt',
      label: l10n.taskEstimatesTypeTshirtLabel,
      rangeLabel: l10n.taskEstimatesTypeTshirtLabel,
      standardDescription: l10n.taskEstimatesTypeTshirtStandard,
      extendedDescription: l10n.taskEstimatesTypeTshirtExtended,
    ),
  ];
}

EstimationTypeMeta estimationTypeMeta(BuildContext context, String? value) {
  final items = estimationTypes(context, includeNone: true);
  return items.firstWhere(
    (type) => type.value == (value ?? 'none'),
    orElse: () => items.first,
  );
}
