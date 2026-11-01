part of 'snapshot.dart';

final class SecurityItem implements NeedsYouItem, LaneItem, BacklogEntry {
  const SecurityItem({required this.title, required this.state, this.product});

  @override
  final String title;
  final LaneState state;
  final Product? product;
}

final class NeedsYou implements NeedsYouItem {
  NeedsYou({
    required this.id,
    required this.title,
    required this.body,
    required List<String> options,
    required this.recommendedOption,
    required this.state,
    required this.versionHash,
    this.kind,
    this.product,
    this.resolvedAt,
    this.resolution,
    this.askTruncated = false,
    this.createdAt,
    this.hubTitle,
    this.hubText,
    List<String>? hubOptions,
    List<String>? optionKeys,
    List<String>? hubOptionKeys,
    this.hubRecommended,
    this.by,
    this.answeredVia,
    this.deadline,
    this.urgency,
    this.askV2 = askV2FieldsEmpty,
  }) : options = List.unmodifiable(options),
       hubOptions = hubOptions == null ? null : List.unmodifiable(hubOptions),
       optionKeys = optionKeys == null ? null : List.unmodifiable(optionKeys),
       hubOptionKeys = hubOptionKeys == null
           ? null
           : List.unmodifiable(hubOptionKeys);

  final String id;
  @override
  final String title;
  final String body;
  final List<String> options;
  final String? recommendedOption;
  final ItemState state;
  final String versionHash;
  final ItemKind? kind;
  final Product? product;

  /// When the hub closed the item; only on `decisions_resolved` history rows.
  final DateTime? resolvedAt;

  /// The answer the hub recorded ("Yes"); only on history rows.
  final String? resolution;
  final bool askTruncated;
  final DateTime? createdAt;
  final String? hubTitle;
  final String? hubText;

  /// Short labels in canonical option order; never used as wire answers.
  final List<String>? hubOptions;
  final List<String>? optionKeys;
  final List<String>? hubOptionKeys;
  final String? hubRecommended;
  final String? by;

  /// Where the hub says the item was answered; null when it did not say.
  final AnsweredVia? answeredVia;

  /// Optional publisher timing; absent when unpublished or unrecognised.
  final AskDeadline? deadline;
  final AskUrgency? urgency;

  /// The hub's optional Inbox fields (`options_v2`, `recommended_id`,
  /// `recommended_why`, `inbox_class`, `deadline_at`, `risk_class`,
  /// `updated_at`, `status`, `resolved_via`, ...). Empty for an older hub.
  final AskV2Fields askV2;

  String optionLabel(int index) {
    final labels = hubOptions;
    if (labels == null) return options[index];
    final canonicalKeys = optionKeys;
    final shortKeys = hubOptionKeys;
    if (shortKeys != null && canonicalKeys == null) return options[index];
    if (canonicalKeys != null && shortKeys != null) {
      if (canonicalKeys.length != options.length ||
          shortKeys.length != labels.length) {
        return options[index];
      }
      final shortIndex = shortKeys.indexOf(canonicalKeys[index]);
      if (shortIndex < 0 || labels[shortIndex].trim().isEmpty) {
        return options[index];
      }
      return labels[shortIndex];
    }
    if (labels.length == options.length && labels[index].trim().isNotEmpty) {
      return labels[index];
    }
    return options[index];
  }

  bool optionRecommended(int index) {
    final recommended = hubRecommended;
    if (recommended != null) {
      if (optionKeys?[index] == recommended) return true;
      if (List.generate(options.length, optionLabel).contains(recommended)) {
        return optionLabel(index) == recommended;
      }
    }
    return options[index] == recommendedOption;
  }
}

final class Lane implements LaneItem {
  const Lane({
    required this.id,
    required this.title,
    required this.role,
    required this.state,
    required this.providerModel,
    required this.ageSeconds,
    required this.etaSeconds,
    this.product,
    this.area,
    this.kind,
    this.fields = const {},
    this.waitingOnAskId,
  });

  final Map<String, HubField> fields;

  /// The open ask (`item-*` id) this lane is blocked on, when published.
  final String? waitingOnAskId;

  final String id;
  @override
  final String title;
  final String role;
  final LaneState state;
  final String providerModel;
  final int? ageSeconds;
  final int? etaSeconds;
  final Product? product;
  final Area? area;
  final LaneKind? kind;
}
