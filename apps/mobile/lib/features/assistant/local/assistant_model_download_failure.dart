enum LocalModelFailure {
  cancelled,
  integrity,
  budget,
  unavailable,
  busy,
  network,
  storage,
  authentication,
}

class LocalModelException implements Exception {
  const LocalModelException(this.reason);
  final LocalModelFailure reason;
}
