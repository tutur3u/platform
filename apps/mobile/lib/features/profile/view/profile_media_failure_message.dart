import 'package:mobile/data/models/profile_media_result.dart';
import 'package:mobile/l10n/l10n.dart';

String profileMediaFailureMessage(
  AppLocalizations l10n,
  ProfileMediaFailure? failure, {
  String? fallback,
}) => switch (failure?.kind) {
  ProfileMediaFailureKind.image => l10n.profileMediaInvalidImage,
  ProfileMediaFailureKind.size => l10n.profileMediaImageTooLarge,
  ProfileMediaFailureKind.authorization => l10n.profileMediaNotAuthorized,
  ProfileMediaFailureKind.conflict => l10n.profileMediaConflict,
  ProfileMediaFailureKind.limited =>
    failure?.diagnostics.retryAfter != null
        ? l10n.profileMediaRateLimitWait(failure!.diagnostics.retryAfter!)
        : l10n.profileMediaRateLimit,
  ProfileMediaFailureKind.unavailable => l10n.profileMediaUnavailable,
  ProfileMediaFailureKind.receipt => l10n.profileMediaInvalidReceipt,
  ProfileMediaFailureKind.file => l10n.profileMediaFileUnavailable,
  _ => fallback ?? l10n.profileUpdateError,
};
