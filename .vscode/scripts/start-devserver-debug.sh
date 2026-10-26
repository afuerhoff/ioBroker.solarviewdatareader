#!/usr/bin/env bash
set -euo pipefail

workspace_root=${1:?Workspace root is required}
profile_dir="$workspace_root/.dev-server/default"
pid_file="$profile_dir/.vscode-debug-server.pid"
mkdir -p "$profile_dir"

if [[ -f "$pid_file" ]]; then
    read -r existing_pid existing_token < "$pid_file" || true
    if [[ ${existing_pid:-} =~ ^[0-9]+$ && -n ${existing_token:-} ]]; then
        while read -r process_pid process_group; do
            if [[ "$process_group" == "$existing_pid" && -r "/proc/$process_pid/environ" ]] &&
                tr '\0' '\n' < "/proc/$process_pid/environ" |
                    grep -Fxq "IOBROKER_DEBUG_SESSION=$existing_token"; then
                echo "A previous dev-server debug session is still running (PID $existing_pid)." >&2
                echo "Stop its preLaunch terminal before starting another session." >&2
                exit 1
            fi
        done < <(ps -eo pid=,pgid=)
    fi
    rm -f "$pid_file"
fi

session_token="${BASHPID}-${RANDOM}-$(date +%s)"
setsid env "IOBROKER_DEBUG_SESSION=$session_token" npm run devserver:debug &
server_pid=$!
pid_tmp="${pid_file}.tmp"
printf '%s %s\n' "$server_pid" "$session_token" > "$pid_tmp"
mv "$pid_tmp" "$pid_file"

cleanup_pid_file() {
    if ! kill -0 -- "-$server_pid" 2>/dev/null; then
        rm -f "$pid_file"
    fi
}

stop_server() {
    trap - INT TERM
    kill -INT -- "-$server_pid" 2>/dev/null || true
    wait "$server_pid" || true
    cleanup_pid_file
    exit 0
}

trap cleanup_pid_file EXIT
trap stop_server INT TERM
if wait "$server_pid"; then
    status=0
else
    status=$?
fi
if ! kill -0 -- "-$server_pid" 2>/dev/null; then
    rm -f "$pid_file"
fi
exit "$status"
