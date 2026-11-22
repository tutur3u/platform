#!/usr/bin/env bash
# Runner setup for the gated Supabase export job.
#
# /mnt is the runner's separate scratch disk; the export script sizes the run
# from the snapshot and fails early if it does not fit. Postgres 17 and
# pgvector come from PGDG for pg_dump and the local restore check. No default
# cluster is created; the export script starts its own on a Unix socket only.
set -euo pipefail

sudo mkdir -p /mnt/supabase-export
sudo chown "$(id -u):$(id -g)" /mnt/supabase-export

sudo apt-get update -qq
sudo apt-get install -y -qq postgresql-common age
echo 'create_main_cluster = false' | sudo tee -a /etc/postgresql-common/createcluster.conf >/dev/null
sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
sudo apt-get install -y -qq postgresql-17 postgresql-17-pgvector
echo "/usr/lib/postgresql/17/bin" >>"$GITHUB_PATH"
