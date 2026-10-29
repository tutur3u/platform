import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/l10n/l10n.dart';

/// "Answered on Mac": the state an open card shows once the hub records an
/// answer that did not come from this device.
String answeredViaText(AppLocalizations l10n, AnsweredVia? via) =>
    switch (via) {
      AnsweredVia.phone => l10n.mastermindAnsweredOnPhone,
      AnsweredVia.mac => l10n.mastermindAnsweredOnMac,
      AnsweredVia.chat => l10n.mastermindAnsweredInChat,
      AnsweredVia.auto => l10n.mastermindAnsweredAutomatically,
      null => l10n.mastermindAnsweredElsewhere,
    };

/// The announcement when an undo-window reply was cancelled because the ask
/// was already answered.
String alreadyAnsweredText(AppLocalizations l10n, AnsweredVia? via) =>
    switch (via) {
      AnsweredVia.phone => l10n.mastermindAlreadyAnsweredOnPhone,
      AnsweredVia.mac => l10n.mastermindAlreadyAnsweredOnMac,
      AnsweredVia.chat => l10n.mastermindAlreadyAnsweredInChat,
      AnsweredVia.auto => l10n.mastermindAlreadyAnsweredAutomatically,
      null => l10n.mastermindAlreadyAnsweredElsewhere,
    };

/// Who answered and where, for a resolved row: "you · on phone", or
/// "automatically" when nobody did.
List<String> answeredByParts(
  AppLocalizations l10n,
  AnsweredVia via,
) => switch (via) {
  AnsweredVia.phone => [l10n.mastermindAnsweredByYou, l10n.mastermindViaPhone],
  AnsweredVia.mac => [l10n.mastermindAnsweredByYou, l10n.mastermindViaMac],
  AnsweredVia.chat => [l10n.mastermindAnsweredByYou, l10n.mastermindViaChat],
  AnsweredVia.auto => [l10n.mastermindViaAuto],
};
