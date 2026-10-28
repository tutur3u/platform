import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
import 'package:mobile/l10n/l10n.dart';

/// Friendly names for lanes, items and models.
///
/// The hub titles a named thread `[Name] Role` (contract v1) and redacts every
/// other title to `Product · area · kind`. A redacted triple is never shown:
/// it repeats the chips and makes every row look the same.

final _namedTitle = RegExp(r'^\[([^\]]{1,40})\]\s*(.*)$');

/// `[Atlas] Mastermind` → (name: Atlas, role: Mastermind); null otherwise.
({String name, String role})? namedTitle(String title) {
  final match = _namedTitle.firstMatch(title.trim());
  if (match == null) return null;
  final name = match.group(1)!.trim();
  if (name.isEmpty) return null;
  return (name: name, role: match.group(2)!.trim());
}

/// The three parts of a redacted `Product · area · kind` title, or null when
/// [title] is a real, human-written title.
({String product, String area, String kind})? redactedTitleParts(String title) {
  final parts = title.trim().split(' · ');
  if (parts.length != 3 || parts.any((part) => part.trim().isEmpty)) {
    return null;
  }
  bool known(Iterable<String> names, String part) =>
      names.any((name) => name.toLowerCase() == part.trim().toLowerCase());
  final product = known(Product.values.map((p) => p.wireName), parts[0]);
  final kind =
      known(LaneKind.values.map((k) => k.wireName), parts[2]) ||
      known(ItemKind.values.map((k) => k.wireName), parts[2]);
  if (!product || !kind) return null;
  return (product: parts[0].trim(), area: parts[1].trim(), kind: parts[2]);
}

bool isRedactedTitle(String title) => redactedTitleParts(title) != null;

/// A lane's display name, in order of preference:
/// 1. the hub's `[Name] Role` title, verbatim;
/// 2. any other real title, verbatim;
/// 3. a named standing role ("Browser Operator") for a redacted title;
/// 4. "{Product} {area}" ("Tuturuuu hub") for a child lane.
String laneDisplayName(AppLocalizations l10n, Lane lane) {
  final title = lane.title.trim();
  final parts = redactedTitleParts(title);
  if (parts == null) return title;
  final role = lane.role.trim();
  if (_isNamedRole(role)) return role;
  return l10n.mastermindNameProductArea(parts.product, parts.area);
}

bool _isNamedRole(String role) {
  final lower = role.toLowerCase();
  return role.isNotEmpty &&
      lower != 'child lane' &&
      lower != 'lane' &&
      lower != 'unknown';
}

/// Keep real titles; redacted titles use the first published ask line.
String itemDisplayTitle(AppLocalizations l10n, NeedsYou item) {
  final parts = redactedTitleParts(item.title);
  if (parts == null && item.title.trim().isNotEmpty) return item.title;
  final firstLine = item.body.trim().split(RegExp(r'\r?\n')).first.trim();
  if (firstLine.isNotEmpty) return firstLine;
  if (parts == null) return l10n.mastermindAskTitle;
  final kind =
      item.kind ??
      ItemKind.values
          .where((k) => k.wireName == parts.kind.trim().toLowerCase())
          .firstOrNull;
  final kindLabel = kind == null
      ? parts.kind.trim()
      : MastermindLabels.itemKind(l10n, kind);
  return l10n.mastermindItemFor(
    kindLabel,
    l10n.mastermindNameProductArea(parts.product, parts.area),
  );
}

final _claude = RegExp(r'^claude-([a-z]+)-(\d+)-(\d+)', caseSensitive: false);
final _gpt = RegExp(r'^gpt-(\d+(?:\.\d+)?)(?:-(.+))?$', caseSensitive: false);

/// "claude / claude-sonnet-5-5" → "Sonnet 5.5"; "codex / gpt-6.1-sol" →
/// "GPT-6.1 sol"; an unknown model reads "Model not reported".
String modelShortName(AppLocalizations l10n, String providerModel) {
  final model = providerModel.split(' / ').last.trim();
  final lower = model.toLowerCase();
  if (model.isEmpty || lower == 'unknown' || lower == 'unknown model') {
    return l10n.mastermindModelNotReported;
  }
  if (_claude.firstMatch(model) case final match?) {
    final family = match.group(1)!;
    return '${family[0].toUpperCase()}${family.substring(1).toLowerCase()} '
        '${match.group(2)}.${match.group(3)}';
  }
  if (_gpt.firstMatch(model) case final match?) {
    final tier = match.group(2);
    return tier == null
        ? 'GPT-${match.group(1)}'
        : 'GPT-${match.group(1)} $tier';
  }
  return model;
}
