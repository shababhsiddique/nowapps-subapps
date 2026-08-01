<?php

/*
|--------------------------------------------------------------------------
| Deploy trigger (exec-free)
|--------------------------------------------------------------------------
| The host disables exec()/shell_exec(), so this script does NOT run git.
| It only writes a flag file; a cron job (running in a real shell) sees the
| flag and runs `git pull --ff-only origin master`.
|
| Two ways to trigger — both just drop the flag:
|   1. Manual : https://<domain>/deploy.php?token=DEPLOY_TOKEN
|   2. GitHub : webhook POST, verified against GITHUB_WEBHOOK_SECRET,
|               deploys only on push to the target branch.
|
| Secrets live in .env at the repo root (gitignored, denied by .htaccess):
|   DEPLOY_TOKEN            (comma-separated for multiple manual tokens)
|   GITHUB_WEBHOOK_SECRET   (optional; enables the GitHub webhook path)
*/

// ---- Configuration ----------------------------------------------------
$flagFile = '/home/shababhs/nowapps-websites.deploy.request'; // outside the repo, keeps tree clean
$branch   = 'master';
$envPath  = __DIR__ . '/.env';

// Read a value straight from the .env.
function env_value(string $key, string $envPath): ?string
{
    if (!is_readable($envPath)) {
        return null;
    }

    foreach (file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) {
            continue;
        }

        [$name, $val] = explode('=', $line, 2);
        if (trim($name) !== $key) {
            continue;
        }

        return trim(trim($val), "\"'"); // strip surrounding quotes
    }

    return null;
}

header('Content-Type: text/plain');

$tokens        = array_filter(array_map('trim', explode(',', env_value('DEPLOY_TOKEN', $envPath) ?? '')));
$webhookSecret = env_value('GITHUB_WEBHOOK_SECRET', $envPath) ?? '';

$event      = $_SERVER['HTTP_X_GITHUB_EVENT'] ?? '';
$body       = file_get_contents('php://input') ?: '';
$authorized = false;
$reason     = '';

// ---- 1) Manual token (query string or X-Deploy-Token header) ----------
$provided = (string) ($_GET['token'] ?? $_SERVER['HTTP_X_DEPLOY_TOKEN'] ?? '');
if ($provided !== '') {
    foreach ($tokens as $token) {
        if ($token !== '' && hash_equals($token, $provided)) {
            $authorized = true;
            $reason     = 'manual token';
            break;
        }
    }
}

// ---- 2) GitHub webhook (verified HMAC signature) ----------------------
if (!$authorized && $webhookSecret !== '' && isset($_SERVER['HTTP_X_HUB_SIGNATURE_256'])) {
    $expected = 'sha256=' . hash_hmac('sha256', $body, $webhookSecret);

    if (hash_equals($expected, (string) $_SERVER['HTTP_X_HUB_SIGNATURE_256'])) {
        // GitHub sends a "ping" when the webhook is first saved.
        if ($event === 'ping') {
            echo "pong\n";
            exit;
        }

        // Only deploy on a push to the target branch.
        $ref = json_decode($body, true)['ref'] ?? '';
        if ($event === 'push' && $ref === "refs/heads/{$branch}") {
            $authorized = true;
            $reason     = 'github push';
        } else {
            http_response_code(202);
            exit("Ignored: event '{$event}', ref '{$ref}'.\n");
        }
    }
}

if (!$authorized) {
    http_response_code(403);
    exit("403 Forbidden\n");
}

// ---- Queue the deploy -------------------------------------------------
if (@file_put_contents($flagFile, gmdate('c') . " ({$reason})\n") === false) {
    http_response_code(500);
    exit("Deploy failed: could not write flag at {$flagFile}\n");
}

echo "Deploy queued ({$reason}) at " . gmdate('c') . " UTC.\n";
echo "Cron will run `git pull --ff-only origin {$branch}` within ~1 minute.\n";
