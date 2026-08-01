#!/bin/bash
#
# Deploy runner — the shell half of the exec-free deploy.
#
# deploy.php (web) cannot run git, so it drops a flag file. This script runs
# from cron every minute, and when it sees the flag it consumes it and pulls.
#
# Install (cron, every minute):
#   * * * * * /home/shababhs/nowapps-subapps/tools/deploy-cron.sh >/dev/null 2>&1
#
# Everything lives inside main() on purpose: bash reads a script lazily, so a
# `git pull` that rewrites this very file mid-run could corrupt execution. A
# function is parsed in full before it is called, which makes that impossible.

set -uo pipefail

REPO_DIR="${REPO_DIR:-/home/shababhs/nowapps-subapps}"
BRANCH="${BRANCH:-master}"
FLAG_FILE="${FLAG_FILE:-/home/shababhs/nowapps-subapps.deploy.request}"
LOCK_FILE="${LOCK_FILE:-/home/shababhs/nowapps-subapps.deploy.lock}"
LOG_FILE="${LOG_FILE:-/home/shababhs/nowapps-subapps.deploy.log}"

main() {
    [[ -f "$FLAG_FILE" ]] || exit 0

    # One deploy at a time. If a pull is already running, leave the flag alone
    # so the next minute's run handles it. Hosts without flock just proceed —
    # the window is small and a concurrent pull fails harmlessly.
    if command -v flock >/dev/null 2>&1; then
        exec 9>"$LOCK_FILE" || exit 0
        flock -n 9 || exit 0
    fi

    local requested
    requested="$(head -c 200 "$FLAG_FILE" 2>/dev/null | tr -d '\n')"

    # Consume the flag *before* pulling: a push that lands during the pull then
    # writes a fresh flag and gets its own deploy, instead of being swallowed.
    rm -f "$FLAG_FILE"

    log "--- deploy requested: ${requested:-unknown}"

    if [[ ! -d "$REPO_DIR/.git" ]]; then
        log "FAILED: $REPO_DIR is not a git checkout"
        exit 1
    fi

    cd "$REPO_DIR" || { log "FAILED: cannot cd to $REPO_DIR"; exit 1; }

    local before after output status
    before="$(git rev-parse --short HEAD 2>/dev/null)"

    # --ff-only, never reset --hard: the checkout is also the docroot and holds
    # untracked runtime data (habit/data/). A fast-forward never touches it.
    output="$(git pull --ff-only origin "$BRANCH" 2>&1)"
    status=$?

    if [[ $status -ne 0 ]]; then
        log "FAILED (git exit $status):"
        log "$output"
        exit 1
    fi

    after="$(git rev-parse --short HEAD 2>/dev/null)"

    if [[ "$before" == "$after" ]]; then
        log "already up to date at $after"
    else
        log "deployed $before -> $after"
        git --no-pager log --oneline "$before..$after" 2>/dev/null | while read -r line; do
            log "    $line"
        done
    fi
}

log() {
    printf '[%s] %s\n' "$(date -u '+%Y-%m-%d %H:%M:%S')" "$1" >> "$LOG_FILE"
}

main "$@"
