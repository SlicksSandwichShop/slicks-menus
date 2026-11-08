@echo off
rem Opens the menu preview on this computer. Close this window to stop it.
cd /d "%~dp0"
where python >nul 2>nul && (set PY=python) || (set PY=py)
echo Preview running at http://127.0.0.1:8077/preview.html
echo Leave this window open while you look. Close it when you are done.
start "" http://127.0.0.1:8077/preview.html
%PY% -m http.server 8077 --bind 127.0.0.1
