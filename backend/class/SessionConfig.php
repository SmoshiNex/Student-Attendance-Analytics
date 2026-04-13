<?php

if (session_status() === PHP_SESSION_NONE) {
    date_default_timezone_set('Asia/Manila');

    ini_set('session.cookie_httponly', '1');
    ini_set('session.use_strict_mode', '1');

    session_set_cookie_params([
        'lifetime' => 86400,
        'path'     => '/',
        'domain'   => '',
        'secure'   => false,
        'httponly' => true,
    ]);

    session_start();

    if (!isset($_COOKIE[session_name()])) {
        $name    = session_name();
        $value   = session_id();
        $expires = gmdate('D, d M Y H:i:s T', time() + 86400);
        header("Set-Cookie: {$name}={$value}; Path=/; HttpOnly; Expires={$expires}", false);
    }
}
