import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/core/utils/search_text.dart';
import 'package:mobile/features/settings/view/settings_row_layout.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/l10n/l10n.dart';

/// A root Settings group to scroll into view, set by links from app
/// sub-screens and consumed by the Settings root.
final ValueNotifier<String?> settingsFocusRequest = ValueNotifier(null);

/// One quick-jump destination in Settings search.
class SettingsSearchEntry {
  const SettingsSearchEntry({
    required this.id,
    required this.icon,
    required this.title,
    required this.section,
    required this.onOpen,
    this.terms = const [],
  });

  final String id;
  final IconData icon;
  final String title;

  /// Where the setting lives, such as "Apps · Timer".
  final String section;
  final VoidCallback onOpen;
  final List<String> terms;
}

List<SettingsSearchEntry> filterSettingsSearch(
  List<SettingsSearchEntry> entries,
  String query,
) {
  final words = foldSearchText(
    query,
  ).split(RegExp(r'\s+')).where((word) => word.isNotEmpty).toList();
  if (words.isEmpty) return const [];
  return [
    for (final entry in entries)
      if (words.every(
        foldSearchText(
          [entry.title, entry.section, ...entry.terms].join(' '),
        ).contains,
      ))
        entry,
  ];
}

class SettingsSearchField extends StatelessWidget {
  const SettingsSearchField({
    required this.controller,
    required this.onChanged,
    super.key,
  });

  final TextEditingController controller;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Semantics(
      textField: true,
      label: l10n.settingsSearchPlaceholder,
      child: AppSearchField(
        key: const ValueKey('settings-search-field'),
        controller: controller,
        placeholder: l10n.settingsSearchPlaceholder,
        onChanged: onChanged,
        clearTooltip: l10n.commonClearSearch,
        clearButtonKey: const ValueKey('settings-search-clear'),
        clearButtonDensity: AppButtonDensity.iconDense,
      ),
    );
  }
}

class SettingsSearchResults extends StatelessWidget {
  const SettingsSearchResults({
    required this.query,
    required this.results,
    super.key,
  });

  final String query;
  final List<SettingsSearchEntry> results;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    if (results.isEmpty) {
      final theme = AppTokens.of(context);
      return Padding(
        key: const ValueKey('settings-search-empty'),
        padding: const EdgeInsets.symmetric(
          horizontal: SettingsRowLayout.captionInset,
          vertical: 24,
        ),
        child: Text(
          l10n.settingsSearchNoResults(query.trim()),
          textAlign: TextAlign.center,
          style: theme.typography.base.copyWith(
            color: theme.colorScheme.mutedForeground,
          ),
        ),
      );
    }
    return SettingsCompactSection(
      key: const ValueKey('settings-search-results'),
      title: l10n.settingsSearchResults(results.length),
      children: [
        for (final entry in results)
          SettingsTile(
            key: ValueKey('settings-search-${entry.id}'),
            grouped: true,
            icon: entry.icon,
            title: entry.title,
            value: entry.section,
            onTap: () {
              FocusManager.instance.primaryFocus?.unfocus();
              entry.onOpen();
            },
          ),
      ],
    );
  }
}
