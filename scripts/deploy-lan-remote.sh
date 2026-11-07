#!/usr/bin/env bash
set -euo pipefail

root="${1:?Missing deployment directory}"
release="${2:?Missing release ID}"
port="${3:?Missing HTTP port}"
app=kid-learn

[[ "$release" =~ ^[0-9]{14}-[0-9a-f]{8}$ && "$port" =~ ^[1-9][0-9]{3,4}$ && "$port" -ge 1024 && "$port" -le 65535 ]]
incoming="$root/.incoming/$release"
target="$root/releases/$release"
marker="$root/current-release"
previous=
switching=0

start_release() {
  local dir="$1" service_port
  service_port="$(cat "$dir/port")"
  pm2 start "$python" --name "$app" --cwd "$dir/site" --interpreter none --force \
    -- -m http.server "$service_port" --bind 0.0.0.0 9>&-
}

healthy() {
  local dir="$1" service_port expected actual
  service_port="$(cat "$dir/port")"
  expected="${dir##*/}"
  for ((attempt = 0; attempt < 15; attempt++)); do
    if actual="$(curl -fsS --max-time 2 "http://127.0.0.1:$service_port/release.txt" 2>/dev/null)" &&
        [[ "$actual" == "$expected" ]]; then
      return 0
    fi
    sleep 1
  done
  return 1
}

finish() {
  local status="$?"
  trap - EXIT
  if (( status != 0 && switching )); then
    echo "Deployment failed. Restoring the previous service." >&2
    if pm2 describe "$app" >/dev/null 2>&1 9>&-; then
      pm2 delete "$app" 9>&- || echo "Could not remove the failed process." >&2
    fi
    if [[ -n "$previous" ]]; then
      if start_release "$previous" && healthy "$previous"; then
        pm2 save --force 9>&- || echo "Could not save the restored process list." >&2
      else
        echo "Automatic restore failed. Check: pm2 logs $app" >&2
      fi
    else
      pm2 save --force 9>&- || echo "Could not save the process list." >&2
    fi
  fi
  rm -f -- "$incoming/kid-learn-$release.tar.gz" "$incoming/deploy-lan-remote.sh" \
    "$incoming/deploy-lan-remote.lf.sh" "$incoming/current-release"
  rmdir -- "$incoming" 2>/dev/null || true
  exit "$status"
}

trap finish EXIT
trap 'exit 1' HUP INT TERM
if ! command -v pm2 >/dev/null || ! command -v node >/dev/null; then
  if [[ "${KID_LEARN_PM2_PROFILE:-}" == 1 ]]; then
    echo "PM2 or Node.js is missing after loading the SSH user's interactive Bash environment." >&2
    exit 1
  fi
  # fnm and nvm are commonly initialized in the interactive part of ~/.bashrc.
  export KID_LEARN_PM2_PROFILE=1
  cd -- "$root"
  exec bash -ic 'exec bash "$@"' bash "$0" "$@" </dev/null
fi
for command in python3 curl tar flock; do
  command -v "$command" >/dev/null || { echo "Required on server: $command" >&2; exit 1; }
done
python="$(command -v python3)"
exec 9>"$root/.deploy.lock"
flock -n 9 || { echo "Another kid-learn deployment is running." >&2; exit 1; }

pm2 ping >/dev/null 9>&-
running=0
if pm2 describe "$app" >/dev/null 2>&1 9>&-; then running=1; fi
[[ ! -e "$marker" || -f "$marker" ]] || { echo "Invalid current-release path." >&2; exit 1; }
if [[ -f "$marker" ]]; then
  read -r old_release < "$marker"
  [[ "$old_release" =~ ^[0-9]{14}-[0-9a-f]{8}$ ]] || { echo "Invalid current-release file." >&2; exit 1; }
  previous="$root/releases/$old_release"
  [[ -r "$previous/port" && -s "$previous/site/index.html" ]] || { echo "Missing previous release." >&2; exit 1; }
elif (( running )); then
  echo "PM2 name $app is already in use outside this deployment." >&2
  exit 1
fi

if (( !running )) || [[ "$(<"$previous/port")" != "$port" ]]; then
  "$python" - "$port" <<'PY'
import socket
import sys

port = int(sys.argv[1])
with socket.socket() as sock:
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        sock.bind(("0.0.0.0", port))
    except OSError as error:
        sys.exit(f"Cannot bind HTTP port {port}: {error}. Choose another port with -Port.")
PY
fi

mkdir -p -- "$root/releases"
mkdir -- "$target"
mkdir -- "$target/site"
tar -xzf "$incoming/kid-learn-$release.tar.gz" --no-same-owner -C "$target/site"
for page in index.html practice/index.html practice/grade7.html sw.js data/questions.json data/grade7-questions.json; do
  [[ -s "$target/site/$page" ]] || { echo "Missing release file: $page" >&2; exit 1; }
done
printf '%s\n' "$release" > "$target/site/release.txt"
printf '%s\n' "$port" > "$target/port"

switching=1
if (( running )); then pm2 delete "$app" 9>&-; fi
start_release "$target"
healthy "$target" || { echo "Health check failed for release $release." >&2; exit 1; }
pm2 save 9>&-
printf '%s\n' "$release" > "$incoming/current-release"
mv -f -- "$incoming/current-release" "$marker"
switching=0
printf 'Active release: %s\n' "$release"
