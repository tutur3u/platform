import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/l10n/l10n.dart';

import 'store_screenshot_app.dart';

/// Every English/Vietnamese fixture pair that differs, as recorded by
/// [StoreLocale.pick]. A capture in one locale must never show the other's.
final Set<(String, String)> storeFixtureStringPairs = {};

/// Shorter strings ("Copy", "Web") are only flagged as a whole text run.
const _minSubstringLength = 12;

/// Every text run on screen: painted paragraphs and editable fields.
List<String> _visibleTexts(WidgetTester tester) => [
  for (final widget in tester.widgetList<RichText>(find.byType(RichText)))
    widget.text.toPlainText(),
  for (final widget in tester.widgetList<EditableText>(
    find.byType(EditableText),
  ))
    widget.controller.text,
];

/// Fails the capture when the screen shows a load error or fixture text from
/// the other listing locale. Both mean the fixture did not feed the page; a
/// screenshot must never crop around them.
void expectCleanStoreCapture(WidgetTester tester, StoreLocale locale) {
  final l10n = lookupAppLocalizations(locale.locale);
  final errors = {l10n.commonSomethingWentWrong, l10n.homeSectionLoadFailed};
  // Plain selection: [StoreLocale.pick] would add to the set being read.
  final english = locale == StoreLocale.en;
  final own = <String>{
    for (final (en, vi) in storeFixtureStringPairs)
      if (english) en else vi,
  };
  final foreign = <String>{
    for (final (en, vi) in storeFixtureStringPairs)
      if (english) vi else en,
  }.difference(own);
  final problems = <String>[];
  for (final text in _visibleTexts(tester)) {
    final trimmed = text.trim();
    if (trimmed.isEmpty) continue;
    for (final error in errors) {
      if (trimmed.contains(error)) problems.add('load error: "$trimmed"');
    }
    for (final other in foreign) {
      if (trimmed == other ||
          (other.length >= _minSubstringLength && trimmed.contains(other))) {
        problems.add('other-locale text: "$trimmed"');
      }
    }
  }
  expect(
    problems.toSet(),
    isEmpty,
    reason: 'A ${locale.name} store capture must show only its own fixtures',
  );
}
