import 'package:intl/intl.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/age_text.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
import 'package:mobile/l10n/l10n.dart';

/// "Running for 2 h", or "Running · age unknown" when the publisher has none.
String laneAgeLine(AppLocalizations l10n, Lane lane) {
  final state = toBeginningOfSentenceCase(
    MastermindLabels.laneState(l10n, lane.state),
    l10n.localeName,
  );
  final seconds = lane.ageSeconds;
  return seconds == null
      ? l10n.mastermindLaneAgeUnknown(state)
      : l10n.mastermindLaneAgeLine(
          state,
          mastermindDurationText(l10n, Duration(seconds: seconds)),
        );
}

/// "About 20 min left"; null when there is no estimate, which hides the line.
String? laneEtaLine(AppLocalizations l10n, Lane lane) {
  final seconds = lane.etaSeconds;
  return seconds == null
      ? null
      : l10n.mastermindLaneEtaAbout(
          mastermindDurationText(l10n, Duration(seconds: seconds)),
        );
}
