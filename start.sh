#!/bin/bash
cd "$(dirname "$0")"

mkdir -p logs

uvicorn server:app --host 0.0.0.0 --port 8000 >> logs/api.log 2>&1 &
echo $! > .pid.api

npm run dev -- --host >> logs/ui.log 2>&1 &
echo $! > .pid.ui

disown

IP=$(hostname -I 2>/dev/null | awk '{print $1}')
echo "Home TV started"
echo "  UI:       http://${IP}:5173"
echo "  Playlist: http://${IP}:8000/playlist.m3u"
echo "  Logs:     logs/api.log  logs/ui.log"
echo "  Stop:     ./stop.sh"
