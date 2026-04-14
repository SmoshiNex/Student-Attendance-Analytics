@echo off
echo =========================================
echo  Smart Campus Attendance — Firewall Setup
echo =========================================
echo.

echo [1/2] Opening port 5174 (Vite Dev Server)...
netsh advfirewall firewall delete rule name="Vite Dev 5174" >nul 2>&1
netsh advfirewall firewall add rule name="Vite Dev 5174" dir=in action=allow protocol=TCP localport=5174
echo       Done.

echo.
echo [2/2] Opening port 3000 (Socket.io WebSocket Server)...
netsh advfirewall firewall delete rule name="Socket.io Server 3000" >nul 2>&1
netsh advfirewall firewall add rule name="Socket.io Server 3000" dir=in action=allow protocol=TCP localport=3000
echo       Done.

echo.
echo =========================================
echo  Both ports are now open on this machine.
echo  Students on your hotspot can reach:
echo    Vite   : http://10.206.51.5:5174
echo    Sockets: http://10.206.51.5:3000
echo =========================================
echo.
pause
