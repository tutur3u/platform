import 'package:flutter/widgets.dart';
import 'package:mobile/l10n/l10n.dart';

class EstimationTypeMeta {
  const EstimationTypeMeta({
    required this.value,
    required this.label,
    required this.rangeLabel,
    required this.standardDescriptionZeroEnabled,
    required this.standardDescriptionZeroDisabled,
    required this.extendedDescriptionZeroEnabled,
    required this.extendedDescriptionZeroDisabled,
  });

  final String value;
  final String label;
  final String rangeLabel;
  final String standardDescriptionZeroEnabled;
  final String standardDescriptionZeroDisabled;
  final String extendedDescriptionZeroEnabled;
  final String extendedDescriptionZeroDisabled;

  String description({
    required bool isExtended,
    required bool allowZeroEstimates,
  }) {
    if (isExtended) {
      return allowZeroEstimates
          ? extendedDescriptionZeroEnabled
          : extendedDescriptionZeroDisabled;
    }

    return allowZeroEstimates
        ? standardDescriptionZeroEnabled
        : standardDescriptionZeroDisabled;
  }
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
        standardDescriptionZeroEnabled: l10n.taskEstimatesTypeNoneDescription,
        standardDescriptionZeroDisabled: l10n.taskEstimatesTypeNoneDescription,
        extendedDescriptionZeroEnabled: l10n.taskEstimatesTypeNoneDescription,
        extendedDescriptionZeroDisabled: l10n.taskEstimatesTypeNoneDescription,
      ),
    EstimationTypeMeta(
      value: 'fibonacci',
      label: l10n.taskEstimatesTypeFibonacciLabel,
      rangeLabel: l10n.taskEstimatesTypeFibonacciLabel,
      standardDescriptionZeroEnabled:
          l10n.taskEstimatesTypeFibonacciStandardZeroEnabled,
      standardDescriptionZeroDisabled:
          l10n.taskEstimatesTypeFibonacciStandardZeroDisabled,
      extendedDescriptionZeroEnabled:
          l10n.taskEstimatesTypeFibonacciExtendedZeroEnabled,
      extendedDescriptionZeroDisabled:
          l10n.taskEstimatesTypeFibonacciExtendedZeroDisabled,
    ),
    EstimationTypeMeta(
      value: 'linear',
      label: l10n.taskEstimatesTypeLinearLabel,
      rangeLabel: l10n.taskEstimatesTypeLinearLabel,
      standardDescriptionZeroEnabled:
          l10n.taskEstimatesTypeLinearStandardZeroEnabled,
      standardDescriptionZeroDisabled:
          l10n.taskEstimatesTypeLinearStandardZeroDisabled,
      extendedDescriptionZeroEnabled:
          l10n.taskEstimatesTypeLinearExtendedZeroEnabled,
      extendedDescriptionZeroDisabled:
          l10n.taskEstimatesTypeLinearExtendedZeroDisabled,
    ),
    EstimationTypeMeta(
      value: 'exponential',
      label: l10n.taskEstimatesTypeExponentialLabel,
      rangeLabel: l10n.taskEstimatesTypeExponentialLabel,
      standardDescriptionZeroEnabled:
          l10n.taskEstimatesTypeExponentialStandardZeroEnabled,
      standardDescriptionZeroDisabled:
          l10n.taskEstimatesTypeExponentialStandardZeroDisabled,
      extendedDescriptionZeroEnabled:
          l10n.taskEstimatesTypeExponentialExtendedZeroEnabled,
      extendedDescriptionZeroDisabled:
          l10n.taskEstimatesTypeExponentialExtendedZeroDisabled,
    ),
    EstimationTypeMeta(
      value: 't-shirt',
      label: l10n.taskEstimatesTypeTshirtLabel,
      rangeLabel: l10n.taskEstimatesTypeTshirtLabel,
      standardDescriptionZeroEnabled:
          l10n.taskEstimatesTypeTshirtStandardZeroEnabled,
      standardDescriptionZeroDisabled:
          l10n.taskEstimatesTypeTshirtStandardZeroDisabled,
      extendedDescriptionZeroEnabled:
          l10n.taskEstimatesTypeTshirtExtendedZeroEnabled,
      extendedDescriptionZeroDisabled:
          l10n.taskEstimatesTypeTshirtExtendedZeroDisabled,
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
