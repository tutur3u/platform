import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';

/// Whether an environment's deploy or CI is in a failing state. Home and Ship
/// share it, so both put the same rows first.
bool environmentIsFailing(EnvironmentRow row) =>
    row.deployStatus == DeployStatus.failure ||
    row.deployStatus == DeployStatus.error ||
    row.ciState == CiState.failure ||
    row.ciState == CiState.error;

/// The product a `?product=` query names on Ship, or null for anything else.
ReleaseProduct? releaseProductFromQuery(String? value) {
  for (final product in ReleaseProduct.values) {
    if (product.wireName == value) return product;
  }
  return null;
}

/// The Ship location for a product filter: the filter lives in the URL, so a
/// Home row can link straight to it.
String shipLocation({ReleaseProduct? product}) => Uri(
  path: Routes.mastermindShip,
  queryParameters: product == null ? null : {'product': product.wireName},
).toString();

/// One product's release line and its environments, production first.
final class ShipProductGroup {
  const ShipProductGroup({
    required this.product,
    required this.environments,
    required this.release,
  });

  final ReleaseProduct product;
  final List<EnvironmentRow> environments;
  final ProductRelease? release;

  bool get failing => environments.any(environmentIsFailing);
}

typedef OpenPrs = ({Product product, int? count});
typedef MergeToLive = ({Product product, double? medianMinutes, int samples});

/// What the delivery series say about pull requests and merges: the latest
/// open count and merge-to-live median per product, and the releases seen.
final class ShipDelivery {
  const ShipDelivery({
    required this.coverage,
    required this.openPrs,
    required this.mergeToLive,
    required this.releasesObserved,
  });

  final Coverage coverage;
  final List<OpenPrs> openPrs;
  final List<MergeToLive> mergeToLive;

  /// A lower bound: null when no release was recorded in the window.
  final int? releasesObserved;

  bool get isEmpty =>
      openPrs.isEmpty && mergeToLive.isEmpty && releasesObserved == null;
}

/// What the Ship tab renders, derived once from one accepted snapshot.
///
/// Products with a failing environment come first, then the rest by name.
/// Nothing here reads the snapshot's own age: each environment keeps the
/// freshness the hub published for it.
final class MastermindShipModel {
  const MastermindShipModel._({
    required this.groups,
    required this.products,
    required this.ci,
    required this.cadence,
    required this.delivery,
  });

  factory MastermindShipModel.from(
    MastermindSnapshot snapshot, {
    ReleaseProduct? product,
  }) {
    final names = <ReleaseProduct>{
      for (final row in snapshot.environments) row.product,
      for (final release in snapshot.products.releases) release.product,
    };
    final all = [
      for (final name in names)
        ShipProductGroup(
          product: name,
          environments: _environmentsOf(snapshot.environments, name),
          release: _releaseOf(snapshot.products.releases, name),
        ),
    ]..sort(_byFailureThenName);
    final shown = [
      for (final group in all)
        if (product == null || group.product == product) group,
    ];
    final cadence = [
      for (final entry in snapshot.observability.cadence)
        if (product == null || entry.product == product) entry,
    ]..sort(_byMostRecentProd);
    return MastermindShipModel._(
      groups: shown,
      products: [for (final group in all) group.product],
      ci: _latestCi(snapshot.observability.ci),
      cadence: cadence,
      delivery: _delivery(snapshot.observability.delivery),
    );
  }

  final List<ShipProductGroup> groups;

  /// Every product present, before the filter, for the filter chips.
  final List<ReleaseProduct> products;
  final List<Ci> ci;
  final List<Cadence> cadence;
  final ShipDelivery delivery;

  bool get hasEnvironments => groups.any((g) => g.environments.isNotEmpty);
}

List<EnvironmentRow> _environmentsOf(
  List<EnvironmentRow> rows,
  ReleaseProduct product,
) {
  final own = [
    for (final row in rows)
      if (row.product == product) row,
  ];
  // Production first; the sort is not stable, so the publisher index breaks
  // ties.
  final indexed = [for (var i = 0; i < own.length; i++) (i, own[i])]
    ..sort((a, b) {
      final byEnvironment = a.$2.environment.index.compareTo(
        b.$2.environment.index,
      );
      return byEnvironment != 0 ? byEnvironment : a.$1.compareTo(b.$1);
    });
  return [for (final entry in indexed) entry.$2];
}

ProductRelease? _releaseOf(
  List<ProductRelease> releases,
  ReleaseProduct product,
) {
  for (final release in releases) {
    if (release.product == product) return release;
  }
  return null;
}

int _byFailureThenName(ShipProductGroup a, ShipProductGroup b) {
  if (a.failing != b.failing) return a.failing ? -1 : 1;
  return a.product.wireName.toLowerCase().compareTo(
    b.product.wireName.toLowerCase(),
  );
}

int _byMostRecentProd(Cadence a, Cadence b) {
  final left = a.lastProdAt;
  final right = b.lastProdAt;
  if (left == null || right == null) {
    if (left == right) return a.product.index.compareTo(b.product.index);
    return left == null ? 1 : -1;
  }
  final byTime = right.compareTo(left);
  return byTime != 0 ? byTime : a.product.index.compareTo(b.product.index);
}

/// One reading per repository, the newest, in repository order.
List<Ci> _latestCi(List<Ci> readings) {
  final latest = <RepositoryName, Ci>{};
  for (final reading in readings) {
    final held = latest[reading.repo];
    if (held == null || reading.t.isAfter(held.t)) {
      latest[reading.repo] = reading;
    }
  }
  return [
    for (final repo in RepositoryName.values)
      if (latest[repo] case final reading?) reading,
  ];
}

ShipDelivery _delivery(Delivery delivery) {
  final prs = <Product, OpenPrPoint>{};
  for (final point in delivery.openPrs) {
    final held = prs[point.product];
    if (held == null || point.t.isAfter(held.t)) prs[point.product] = point;
  }
  final merges = <Product, MergeToLivePoint>{};
  for (final point in delivery.mergeToLive) {
    final held = merges[point.product];
    if (held == null || point.t.isAfter(held.t)) merges[point.product] = point;
  }
  return ShipDelivery(
    coverage: delivery.coverage,
    openPrs: [
      for (final product in Product.values)
        if (prs[product] case final point?)
          (product: product, count: point.count),
    ],
    mergeToLive: [
      for (final product in Product.values)
        if (merges[product] case final point?)
          (
            product: product,
            medianMinutes: point.medianMinutes,
            samples: point.samples,
          ),
    ],
    releasesObserved: delivery.ships.isEmpty
        ? null
        : delivery.ships.fold<int>(0, (sum, point) => sum + point.count),
  );
}
