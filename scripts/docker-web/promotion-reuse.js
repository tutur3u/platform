function isBlueGreenWebAlreadyPromoted({
  activeColor,
  latestCommitHash,
  previousTargetState,
  selectedFrontend,
}) {
  return (
    latestCommitHash != null &&
    (activeColor === 'blue' || activeColor === 'green') &&
    previousTargetState.targets.web.commitHash === latestCommitHash &&
    previousTargetState.targets.web.activeColor === activeColor &&
    previousTargetState.targets.web.frontend === selectedFrontend &&
    previousTargetState.targets.web.health === 'healthy'
  );
}

function resolveLatestCommitHash(latestCommit) {
  return typeof latestCommit?.hash === 'string' && latestCommit.hash.length > 0
    ? latestCommit.hash
    : null;
}

module.exports = { isBlueGreenWebAlreadyPromoted, resolveLatestCommitHash };
