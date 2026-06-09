function isTransientDockerRegistryError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const referencesDockerRegistry =
    /(?:registry-1\.docker\.io|auth\.docker\.io|docker\.io\/v2\/|\/manifests\/)/iu.test(
      message
    );
  const isNetworkTimeout =
    /(?:context deadline exceeded|Client\.Timeout exceeded|request canceled|TLS handshake timeout|i\/o timeout|connection reset by peer|unexpected EOF|temporary failure|network is unreachable)/iu.test(
      message
    );
  const isRegistryServerError =
    /(?:502 Bad Gateway|503 Service Unavailable|504 Gateway Timeout|unexpected status .*5\d\d)/iu.test(
      message
    );

  return (
    referencesDockerRegistry && (isNetworkTimeout || isRegistryServerError)
  );
}

module.exports = {
  isTransientDockerRegistryError,
};
