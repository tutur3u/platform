#!/usr/bin/env bash
set +e
diagnostics_dir="tmp/e2e-diagnostics"
mkdir -p "$diagnostics_dir"

{
  printf 'run_id=%s\n' "${GITHUB_RUN_ID}"
  printf 'job=%s\n' "${GITHUB_JOB}"
  printf 'sha=%s\n' "${GITHUB_SHA}"
  printf 'ref=%s\n' "${GITHUB_REF}"
  printf 'shard=%s/%s\n' "${E2E_SHARD_INDEX}" "${E2E_TOTAL_SHARDS}"
  printf 'base_url=%s\n' "${BASE_URL}"
  printf 'portless_port=%s\n' "${PORTLESS_PORT}"
  printf 'docker_web_proxy_host_port=%s\n' "${DOCKER_WEB_PROXY_HOST_PORT:-7803}"
  printf 'compose_project=%s\n' "${DOCKER_WEB_COMPOSE_PROJECT_NAME}"
  date -u +"collected_at=%Y-%m-%dT%H:%M:%SZ"
} > "$diagnostics_dir/summary.txt"

if [ -f tmp/e2e/web.env ]; then
  sed -E 's/^([^=]+)=.*/\1=<redacted>/' tmp/e2e/web.env > "$diagnostics_dir/web-env.keys.txt"
else
  echo "tmp/e2e/web.env not found" > "$diagnostics_dir/web-env.keys.txt"
fi

docker ps -a --filter "label=com.docker.compose.project=${DOCKER_WEB_COMPOSE_PROJECT_NAME}" --format "table {{.Names}}\t{{.Status}}\t{{.Image}}" > "$diagnostics_dir/docker-containers.txt" 2>&1 || true
docker compose --env-file tmp/e2e/web.env -f docker-compose.web.prod.yml -p "${DOCKER_WEB_COMPOSE_PROJECT_NAME}" ps -a > "$diagnostics_dir/docker-compose-ps.txt" 2>&1 || true
docker compose --env-file tmp/e2e/web.env -f docker-compose.web.prod.yml -p "${DOCKER_WEB_COMPOSE_PROJECT_NAME}" logs --tail=1000 web-proxy web-blue web-green hive-blue hive-green hive-realtime meet-realtime markitdown storage-unzip-proxy web-cron-runner > "$diagnostics_dir/docker-compose-services.log" 2>&1 || true
docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}" > "$diagnostics_dir/docker-images.txt" 2>&1 || true
web_proxy_login_url="http://127.0.0.1:${DOCKER_WEB_PROXY_HOST_PORT:-7803}/login"
curl -i --max-time 10 "$web_proxy_login_url" > "$diagnostics_dir/web-proxy-login.txt" 2>&1 || true
bun x portless list > "$diagnostics_dir/portless-list.txt" 2>&1 || true
portless_login_url="${BASE_URL%/}/login"
curl -k -i --max-time 10 "$portless_login_url" > "$diagnostics_dir/portless-login.txt" 2>&1 || true
bun sb:status > "$diagnostics_dir/supabase-status.txt" 2>&1 || true

if [ -f apps/web/test-results/.last-run.json ]; then
  cp apps/web/test-results/.last-run.json "$diagnostics_dir/playwright-last-run.json"
else
  echo "apps/web/test-results/.last-run.json not found" > "$diagnostics_dir/playwright-last-run.json"
fi

echo "::group::Docker containers for E2E project"
cat "$diagnostics_dir/docker-containers.txt"
echo "::endgroup::"

echo "::group::Docker Compose status"
cat "$diagnostics_dir/docker-compose-ps.txt"
echo "::endgroup::"

echo "::group::Docker Compose logs"
tail -n 300 "$diagnostics_dir/docker-compose-services.log"
echo "::endgroup::"

echo "::group::Docker web proxy login probe"
cat "$diagnostics_dir/web-proxy-login.txt"
echo "::endgroup::"

echo "::group::Supabase status"
cat "$diagnostics_dir/supabase-status.txt"
echo "::endgroup::"

echo "::group::Portless login probe"
cat "$diagnostics_dir/portless-login.txt"
echo "::endgroup::"

echo "::group::Playwright last run"
cat "$diagnostics_dir/playwright-last-run.json"
echo "::endgroup::"
