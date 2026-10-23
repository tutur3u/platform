import 'package:flutter/material.dart';
import 'package:mobile/core/input/platform_text_context_menu.dart';
import 'package:mobile/features/settings/view/settings_row_layout.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

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

const _folds = {
  'a': 'àáạảãâầấậẩẫăằắặẳẵ',
  'e': 'èéẹẻẽêềếệểễ',
  'i': 'ìíịỉĩ',
  'o': 'òóọỏõôồốộổỗơờớợởỡ',
  'u': 'ùúụủũưừứựửữ',
  'y': 'ỳýỵỷỹ',
  'd': 'đ',
};

final Map<String, String> _foldTable = {
  for (final fold in _folds.entries)
    for (final char in fold.value.split('')) char: fold.key,
};

/// Lowercase and strip Vietnamese diacritics so "mui gio" finds "Múi giờ".
String foldSettingsSearch(String value) => value
    .toLowerCase()
    .split('')
    .map((char) => _foldTable[char] ?? char)
    .join()
    .trim();

List<SettingsSearchEntry> filterSettingsSearch(
  List<SettingsSearchEntry> entries,
  String query,
) {
  final words = foldSettingsSearch(
    query,
  ).split(RegExp(r'\s+')).where((word) => word.isNotEmpty).toList();
  if (words.isEmpty) return const [];
  return [
    for (final entry in entries)
      if (words.every(
        foldSettingsSearch(
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
      child: shad.TextField(
        key: const ValueKey('settings-search-field'),
        selectionControls: platformTextSelectionControls(),
        contextMenuBuilder: platformTextContextMenuBuilder(),
        controller: controller,
        placeholder: Text(l10n.settingsSearchPlaceholder),
        onChanged: onChanged,
        textInputAction: TextInputAction.search,
        borderRadius: BorderRadius.circular(SettingsRowLayout.cardRadius),
        filled: true,
        features: [
          const shad.InputFeature.leading(
            Icon(shad.LucideIcons.search, size: 18),
          ),
          if (controller.text.isNotEmpty)
            shad.InputFeature.trailing(
              shad.IconButton.ghost(
                key: const ValueKey('settings-search-clear'),
                density: shad.ButtonDensity.iconDense,
                icon: Icon(
                  shad.LucideIcons.x,
                  size: 18,
                  semanticLabel: l10n.commonClearSearch,
                ),
                onPressed: () {
                  controller.clear();
                  onChanged('');
                },
              ),
            ),
        ],
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
      final theme = shad.Theme.of(context);
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
            onTap: entry.onOpen,
          ),
      ],
    );
  }
}
