typedef Clock = DateTime Function();

enum SnapshotAge {
  fresh,
  aging,
  stale;

  static SnapshotAge from(DateTime generatedAt, {Clock? clock}) {
    final age = (clock ?? DateTime.now)().toUtc().difference(
      generatedAt.toUtc(),
    );
    if (age <= const Duration(minutes: 5)) return fresh;
    if (age <= const Duration(minutes: 15)) return aging;
    return stale;
  }
}
