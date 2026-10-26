#!/usr/bin/env bash
set -euo pipefail

pid_file=${1:?PID file path is required}

if [[ ! -f "$pid_file" ]]; then
    echo "No tracked dev-server debug session to stop."
    exit 0
fi

read -r server_pid session_token < "$pid_file"
if [[ ! ${server_pid:-} =~ ^[0-9]+$ || -z ${session_token:-} ]]; then
    echo "Invalid dev-server debug PID file: $pid_file" >&2
    exit 1
fi

session_found=false
while read -r process_pid process_group; do
    if [[ "$process_group" == "$server_pid" && -r "/proc/$process_pid/environ" ]] &&
        tr '\0' '\n' < "/proc/$process_pid/environ" |
            grep -Fxq "IOBROKER_DEBUG_SESSION=$session_token"; then
        session_found=true
        break
    fi
done < <(ps -eo pid=,pgid=)

if ! ps -eo pgid= | awk -v group="$server_pid" '$1 == group { found = 1 } END { exit !found }'; then
    rm -f "$pid_file"
    echo "The tracked dev-server process group has already stopped."
    exit 0
fi

if [[ "$session_found" != true ]]; then
    echo "Refusing to signal process group $server_pid because its session marker was not found." >&2
    exit 1
fi

kill -INT -- "-$server_pid" 2>/dev/null || true
for _ in {1..10}; do
    if ! kill -0 -- "-$server_pid" 2>/dev/null; then
        rm -f "$pid_file"
        echo "Dev-server process group stopped cleanly."
        exit 0
    fi
    sleep 1
done

echo "Dev-server did not stop after SIGINT; sending SIGTERM to its tracked process group." >&2
kill -TERM -- "-$server_pid" 2>/dev/null || true
for _ in {1..3}; do
    if ! kill -0 -- "-$server_pid" 2>/dev/null; then
        rm -f "$pid_file"
        echo "Dev-server process group stopped."
        exit 0
    fi
    sleep 1
done

echo "Dev-server did not stop after SIGTERM; sending SIGKILL to its tracked process group." >&2
kill -KILL -- "-$server_pid" 2>/dev/null || true
rm -f "$pid_file"
