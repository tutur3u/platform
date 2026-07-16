import 'package:mobile/l10n/l10n.dart';

String storefrontStatusLabel(AppLocalizations l10n, String value) =>
    switch (value) {
      'all' => l10n.storefrontStatusAll,
      'draft' => l10n.storefrontStatusDraft,
      'published' => l10n.storefrontStatusPublished,
      'paused' => l10n.storefrontStatusPaused,
      'archived' => l10n.storefrontStatusArchived,
      _ => value,
    };

String storefrontVisibilityLabel(AppLocalizations l10n, String value) =>
    switch (value) {
      'private' => l10n.storefrontVisibilityPrivate,
      'public' => l10n.storefrontVisibilityPublic,
      _ => value,
    };
