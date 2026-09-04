@echo off
REM Startup script for Pi Agent service on Windows
REM This script starts the PM2 daemon and the agent-engine service

cd /d D:\Project\pi-agent\apps\server

REM Start PM2 daemon if not running
pm2 start ecosystem.config.cjs

REM Save PM2 configuration
pm2 save

echo Pi Agent service started successfully
echo To view logs: pm2 logs agent-engine
echo To stop: pm2 stop agent-engine
