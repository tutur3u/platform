#!/usr/bin/env bash
set -euo pipefail
phase=invalid
case "${1:-}" in
  route-tree|capture|restore|debug-pack|pack-graph) phase="$1" ;;
esac
finish() {
  result=$?
  code=MEET_RELEASE_SHELL_COMPLETE
  if [ "$result" -ne 0 ]; then code=MEET_RELEASE_SHELL_STOP; fi
  if [ -n "${RUNNER_TEMP:-}" ]; then
    printf '{"guardCode":"%s","phase":"%s","exitCode":%s}\n' "$code" "$phase" "$result" > "$RUNNER_TEMP/meet-release-$phase-result.json"
  fi
  if [ -n "${verify_dir:-}" ]; then rm -rf -- "$verify_dir"; fi
}
trap finish EXIT
case "${1:-}" in
  pack-graph)
    set -- meet-native-run-*
    if [ -d "$1" ]; then tar -czf meet-native-evidence.tar.gz -- "$@"; fi
    ;;
  route-tree)
    route_tree=apps/meet/src/routeTree.gen.ts
    if [ ! -f "$route_tree" ]; then
      echo '::notice::Meet route tree is absent; no generated evidence captured'
      exit 0
    fi
    head_tracked=false
    if git cat-file -e "HEAD:$route_tree" 2>/dev/null; then
      head_tracked=true
    fi
    source_origin=unproven
    if [ "$MEET_ROUTE_TREE_BEFORE" = absent ] && [ "$head_tracked" = false ]; then
      case "$MEET_FRONTEND_BUILD_OUTCOME" in
        success|failure) source_origin=fresh-bootstrap ;;
      esac
    fi
    evidence="$RUNNER_TEMP/meet-route-tree-$SOURCE_SHA-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
    mkdir "$evidence"
    cp "$route_tree" "$evidence/routeTree.gen.ts"
    {
      printf 'expected_source_sha=%s\n' "$SOURCE_SHA"
      printf 'source_head=%s\n' "$(git rev-parse HEAD)"
      printf 'github_sha=%s\n' "$GITHUB_SHA"
      printf 'prebuild_state=%s\n' "$MEET_ROUTE_TREE_BEFORE"
      printf 'head_tracked=%s\n' "$head_tracked"
      printf 'build_outcome=%s\n' "$MEET_FRONTEND_BUILD_OUTCOME"
      printf 'source_origin=%s\n' "$source_origin"
      printf 'bun_lock_sha256=%s\n' "$(sha256sum bun.lock | cut -d ' ' -f 1)"
      printf 'route_tree_sha256=%s\n' "$(sha256sum "$evidence/routeTree.gen.ts" | cut -d ' ' -f 1)"
    } > "$evidence/source-receipt.txt"
    ;;
  capture)
    for service in frontend realtime; do
      worker=tuturuuu-meet
      if [ "$service" = realtime ]; then worker=tuturuuu-meet-realtime; fi
      bun x --no-install wrangler versions list --name "$worker" --json > "$RUNNER_TEMP/meet-$service-versions-raw.json"
      bun x --no-install wrangler deployments list --name "$worker" --json > "$RUNNER_TEMP/meet-$service-deployments-raw.json"
      jq -e '[.[] | {id, created_on: .metadata.created_on}] | select(length > 0) | select(all(.[]; (.id | type == "string") and (.created_on | type == "string")))' "$RUNNER_TEMP/meet-$service-versions-raw.json" > "$RUNNER_TEMP/meet-rollback-$service-versions.json"
      jq -e '[.[] | {id, created_on, versions}] | select(length > 0) | select(all(.[]; (.id | type == "string") and (.versions | length > 0)))' "$RUNNER_TEMP/meet-$service-deployments-raw.json" > "$RUNNER_TEMP/meet-rollback-$service-deployments.json"
      # Pin the exact serving version before any write: the active
      # deployment must be one version at 100%, or nothing is published.
      jq -e '[.[] | select(.created_on | type == "string")] | max_by(.created_on) | select(.versions | length == 1) | .versions[0] | select(.percentage == 100) | .version_id | select(type == "string" and test("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")) | {versionId: .}' "$RUNNER_TEMP/meet-$service-deployments-raw.json" > "$RUNNER_TEMP/meet-rollback-$service-target.json"
    done
    ;;
  restore)
    status=0
    for service in frontend realtime; do
      worker=tuturuuu-meet
      if [ "$service" = realtime ]; then worker=tuturuuu-meet-realtime; fi
      target=$(jq -r '.versionId' "$RUNNER_TEMP/meet-rollback-$service-target.json")
      bun x --no-install wrangler versions deploy "$target@100%" --name "$worker" --message "Restore pair after failed $GITHUB_SHA" --yes || status=1
      bun x --no-install wrangler deployments list --name "$worker" --json > "$RUNNER_TEMP/meet-restored-$service-deployments.json" || status=1
      jq -e --arg target "$target" '[.[] | select(.created_on | type == "string")] | max_by(.created_on) | (.versions | length == 1) and .versions[0].version_id == $target and .versions[0].percentage == 100' "$RUNNER_TEMP/meet-restored-$service-deployments.json" > /dev/null || { echo "Meet $service is not serving its pinned version"; status=1; }
    done
    exit "$status"
    ;;
  debug-pack)
    test "$(git rev-parse HEAD)" = "$SOURCE_SHA"
    GITHUB_SHA="$SOURCE_SHA" node scripts/ci/verify-meet-start-output.js verify apps/meet apps/meet/meet-artifact.json
    pointer=.wrangler/deploy/config.json
    if [ -f apps/meet/.void/preview-deploy-config.json ]; then
      pointer=.void/preview-deploy-config.json
    fi
    tar -czf "$RUNNER_TEMP/meet-debug-sealed-source.tar.gz" -C apps/meet dist "$pointer" meet-artifact.json
    verify_dir="$(mktemp -d "${RUNNER_TEMP:?}/meet-debug-verify.XXXXXX")"
    tar -xzf "$RUNNER_TEMP/meet-debug-sealed-source.tar.gz" -C "$verify_dir"
    cmp "apps/meet/meet-artifact.json" "$verify_dir/meet-artifact.json"
    GITHUB_SHA="$SOURCE_SHA" node scripts/ci/verify-meet-start-output.js verify "$verify_dir" "$verify_dir/meet-artifact.json"
    GITHUB_SHA="$SOURCE_SHA" node scripts/ci/verify-meet-start-output.js verify apps/meet apps/meet/meet-artifact.json
    printf 'classification=DEBUG sealed source; NOT qualified release\nexpected_source_sha=%s\ncheckout_head=%s\ngithub_sha=%s\nworkflow_source_sha=%s\nevent_name=%s\nrun_id=%s\nrun_attempt=%s\n' "$SOURCE_SHA" "$(git rev-parse HEAD)" "$GITHUB_SHA" "$WORKFLOW_SOURCE_SHA" "$GITHUB_EVENT_NAME" "$GITHUB_RUN_ID" "$GITHUB_RUN_ATTEMPT" > "$RUNNER_TEMP/meet-debug-sealed-source.txt"
    sha256sum "$RUNNER_TEMP/meet-debug-sealed-source.tar.gz" "apps/meet/meet-artifact.json" >> "$RUNNER_TEMP/meet-debug-sealed-source.txt"
    ;;
  *) echo "MEET_RELEASE_OPERATION_INVALID" >&2; exit 1 ;;
esac
