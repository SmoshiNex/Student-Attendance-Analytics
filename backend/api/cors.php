<?php
/**
 * Shared CORS helper — include at the top of every API file.
 * Allows: localhost, LAN IPs, ngrok tunnels, Cloudflare tunnels.
 */

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';

if ($origin !== '' && (
    preg_match(
        '/^https?:\/\/((localhost|127\.0\.0\.1)|(10\.\d{1,3}\.\d{1,3}\.\d{1,3})|(192\.168\.\d{1,3}\.\d{1,3})|(172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}))(:\d+)?$/i',
        $origin
    )
    || preg_match('/\.ngrok-free\.app$/i', $origin)
    || preg_match('/\.ngrok\.io$/i', $origin)
    || preg_match('/\.trycloudflare\.com$/i', $origin)
)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Credentials: true');
    header('Vary: Origin');
}

header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}
