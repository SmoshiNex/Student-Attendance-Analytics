<?php

if (session_status() === PHP_SESSION_NONE) {
    date_default_timezone_set('Asia/Manila');

    $isSecure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https')
        || (!empty($_SERVER['HTTP_CF_VISITOR']) && strpos($_SERVER['HTTP_CF_VISITOR'], '"https"') !== false);

    ini_set('session.cookie_httponly', '1');
    ini_set('session.use_strict_mode', '1');

    session_set_cookie_params([
        'lifetime' => 86400,
        'path'     => '/',
        'domain'   => '',
        'secure'   => $isSecure,
        'httponly' => true,
        'samesite' => $isSecure ? 'None' : 'Lax',
    ]);

    session_start();

    if (!isset($_COOKIE[session_name()])) {
        $name    = session_name();
        $value   = session_id();
        $expires = gmdate('D, d M Y H:i:s T', time() + 86400);
        $secureFlag = $isSecure ? '; Secure; SameSite=None' : '; SameSite=Lax';
        header("Set-Cookie: {$name}={$value}; Path=/; HttpOnly; Expires={$expires}{$secureFlag}", false);
    }
}
