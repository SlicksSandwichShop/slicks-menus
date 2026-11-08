#!/bin/bash
# Opens the menu preview on this computer (Mac). Close this window to stop it.
cd "$(dirname "$0")"
echo "Preview running at http://127.0.0.1:8077/preview.html"
echo "Leave this window open while you look. Close it when you are done."
(sleep 1; open "http://127.0.0.1:8077/preview.html") &
python3 -m http.server 8077 --bind 127.0.0.1
