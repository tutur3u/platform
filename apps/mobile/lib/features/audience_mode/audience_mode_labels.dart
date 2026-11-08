import 'package:mobile/features/audience_mode/audience_mode.dart';
import 'package:mobile/l10n/l10n.dart';

String audienceModeLabel(AppLocalizations l10n, AudienceMode mode) =>
    switch (mode) {
      AudienceMode.general => l10n.audienceModeGeneral,
      AudienceMode.education => l10n.audienceModeEducation,
    };

String audienceModeDescription(AppLocalizations l10n, AudienceMode mode) =>
    switch (mode) {
      AudienceMode.general => l10n.audienceModeGeneralDescription,
      AudienceMode.education => l10n.audienceModeEducationDescription,
    };
