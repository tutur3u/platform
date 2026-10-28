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
    this.hubRecommended,
    this.by,
  }) : options = List.unmodifiable(options),
       hubOptions = hubOptions == null ? null : List.unmodifiable(hubOptions);

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
  final String? hubRecommended;
  final String? by;

  String optionLabel(int index) =>
      hubOptions != null &&
          hubOptions!.length == options.length &&
          hubOptions![index].trim().isNotEmpty
      ? hubOptions![index]
      : options[index];

  bool optionRecommended(int index) =>
      hubRecommended != null &&
          List.generate(options.length, optionLabel).contains(hubRecommended)
      ? optionLabel(index) == hubRecommended
      : options[index] == recommendedOption;
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
  });

  final Map<String, HubField> fields;

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
