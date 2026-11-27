#!/bin/sh

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

# Bound the fetch and its transport and credential helpers on macOS and Linux.
if GIT_TERMINAL_PROMPT=0 SSH_ASKPASS_REQUIRE=never perl -MPOSIX=setpgid -e '
    my $pid = fork();
    exit 1 unless defined $pid;
    if (!$pid) {
        setpgid(0, 0) == 0 or exit 1;
        exec @ARGV;
        exit 1;
    }
    setpgid($pid, $pid);
    $SIG{ALRM} = sub {
        kill "KILL", -$pid;
        waitpid($pid, 0);
        exit 1;
    };
    alarm 10;
    waitpid($pid, 0);
    exit($? != 0);
' git fetch origin --prune --quiet --no-recurse-submodules </dev/null >/dev/null 2>&1; then
    freshness="fetched $(TZ=Asia/Ho_Chi_Minh date +%H:%M)"
else
    freshness="fetch unavailable, cached refs"
fi

counts=$(git rev-list --left-right --count HEAD...origin/main 2>/dev/null) || {
    printf 'Repo freshness: origin/main comparison unavailable\n'
    exit 0
}
# rev-list reports HEAD-only commits first and origin/main-only commits second.
read -r ahead behind <<EOF
$counts
EOF
printf 'Repo freshness: HEAD is %s behind / %s ahead of origin/main (%s)\n' "$behind" "$ahead" "$freshness"
if [ "$behind" -gt 0 ]; then
    printf 'Rebase your task branch when allowed, or start a new worktree from origin/main.\n'
fi
exit 0
