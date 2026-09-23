#!/bin/sh
set -eu
PATH=/usr/sbin:/usr/bin:/sbin:/bin
export PATH
[ "$(id -u)" = 0 ] || exit 1
[ "$#" = 2 ] || exit 1
source=$1
digest=$2
case "$source" in /*) ;; *) exit 1 ;; esac
[ "${#digest}" = 64 ] || exit 1
case "$digest" in *[!0-9a-f]*) exit 1 ;; esac
[ -f "$source" ] && [ ! -L "$source" ] || exit 1
umask 077
stage=$(mktemp -d /var/tmp/tuturuuu-update.XXXXXXXX)
trap 'rm -rf -- "$stage"' EXIT HUP INT TERM
cp -- "$source" "$stage/update.deb"
printf '%s  %s\n' "$digest" "$stage/update.deb" | sha256sum --check --status
[ "$(dpkg-deb --field "$stage/update.deb" Package)" = tuturuuu-beta ] || exit 1
apt-get install --yes --no-install-recommends "$stage/update.deb"
