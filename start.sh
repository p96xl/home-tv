#!/bin/bash
set -e
cd "$(dirname "$0")"

# pipx installs to ~/.local/bin which may not be in PATH on fresh servers
UVICORN=$(command -v uvicorn 2>/dev/null || echo "$HOME/.local/bin/uvicorn")

if [ ! -x "$UVICORN" ]; then
    echo "Error: uvicorn not found. Run setup first:"
    echo "  pipx install uvicorn[standard]"
    echo "  pipx inject uvicorn fastapi httpx"
    echo "  pipx ensurepath && source ~/.bashrc"
    echo "  npm install && npm run build"
    exit 1
fi

if [ -f server.pid ] && kill -0 "$(cat server.pid)" 2>/dev/null; then
    echo "Already running (PID $(cat server.pid)). To restart: kill \$(cat server.pid) && ./start.sh"
    exit 0
fi

mkdir -p logs

nohup "$UVICORN" server:app --host 0.0.0.0 --port 8000 >> logs/server.log 2>&1 &
echo $! > server.pid
echo "Home TV started on :8000 (PID $(cat server.pid))"
echo "Logs:  tail -f logs/server.log"
echo "Stop:  kill \$(cat server.pid)"
