import 'package:flutter/widgets.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Keep app/Material resources in the selected language. Shad-only controls use
/// English when the installed package has no resources for that app locale.
class AppShadcnLocalizationsDelegate
    extends LocalizationsDelegate<shad.ShadcnLocalizations> {
  const AppShadcnLocalizationsDelegate();

  @override
  bool isSupported(Locale locale) => AppLocalizations.supportedLocales.any(
    (supported) => supported.languageCode == locale.languageCode,
  );

  @override
  Future<shad.ShadcnLocalizations> load(Locale locale) =>
      shad.ShadcnLocalizations.delegate.load(
        shad.ShadcnLocalizations.delegate.isSupported(locale)
            ? locale
            : const Locale('en'),
      );

  @override
  bool shouldReload(AppShadcnLocalizationsDelegate old) => false;
}
