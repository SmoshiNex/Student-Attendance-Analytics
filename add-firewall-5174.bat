@echo off
echo Adding firewall rule for Vite port 5174...
netsh advfirewall firewall delete rule name="Vite Dev 5174" >nul 2>&1
netsh advfirewall firewall add rule name="Vite Dev 5174" dir=in action=allow protocol=TCP localport=5174
echo.
echo Done! Port 5174 is now open.
echo You can close this window.
pause
