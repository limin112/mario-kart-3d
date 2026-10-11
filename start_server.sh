#!/bin/bash
cd /home/hatch/workspace/mario-kart-3d/game
python3 -m http.server 8901 > /tmp/server.log 2>&1 &
echo $! > /tmp/server.pid
echo "Server started with PID $!"