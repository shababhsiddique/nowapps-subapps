<?php
/* ==========================================================================
   Habit Now — account deletion request.

   Google Play's Data deletion policy wants a publicly reachable URL where a
   deletion can be requested WITHOUT installing the app, for people who already
   uninstalled. In-app deletion (Profile → Delete account) stays the primary
   path; this is the fallback.

   The form queues a request rather than deleting anything itself: this page is
   unauthenticated, so acting on it directly would let anyone delete anyone's
   account by typing their address. Requests are appended to a log and actioned
   by hand after replying to confirm ownership.
   ========================================================================== */
declare(strict_types=1);

/* One JSON object per line. The .php extension and the exit guard are
   deliberate: this file lives under the web root, and a plain .txt would be
   downloadable by anyone who guessed the name — a list of the email addresses
   of people asking to be forgotten is the worst possible thing to leak. The
   guard makes a direct hit render nothing even where .htaccess is ignored
   (nginx, Caddy). Read it over SSH; every line after the first is plain JSON. */
const LOG_FILE  = __DIR__ . '/data/delete-requests.log.php';
const LOG_GUARD = "<?php exit; /* deletion requests — one JSON object per line */ ?>\n";

/** Refuse to grow without bound if the form is ever hammered. */
const LOG_MAX_BYTES = 4194304; // 4 MB

const MAX_FIELD_LEN = 400;
const MAX_NOTE_LEN  = 2000;

$errors    = [];
$submitted = false;
$values    = ['email' => '', 'note' => ''];

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    $values['email'] = trim((string)($_POST['email'] ?? ''));
    $values['note']  = trim((string)($_POST['note'] ?? ''));
    $confirmed       = isset($_POST['confirm']);

    // Honeypot. Real people never see this field, so anything in it is a bot;
    // answer as if it worked rather than telling it what gave it away.
    if (trim((string)($_POST['website'] ?? '')) !== '') {
        $submitted = true;
    } else {
        if ($values['email'] === '') {
            $errors['email'] = 'Enter the email address on the account.';
        } elseif (strlen($values['email']) > MAX_FIELD_LEN
            || !filter_var($values['email'], FILTER_VALIDATE_EMAIL)) {
            $errors['email'] = 'That doesn’t look like an email address.';
        }
        if (strlen($values['note']) > MAX_NOTE_LEN) {
            $errors['note'] = 'Please keep this under ' . MAX_NOTE_LEN . ' characters.';
        }
        if (!$confirmed) {
            $errors['confirm'] = 'Please confirm you understand this is permanent.';
        }

        if (!$errors) {
            $submitted = queue_deletion_request($values['email'], $values['note']);
            if (!$submitted) {
                $errors['form'] = 'Something went wrong saving your request. '
                    . 'Please email contact.appsnow@gmail.com instead.';
            }
        }
    }
}

/**
 * Appends one request to the log. Returns false if it couldn't be written —
 * the caller must then tell the user, because a silent failure here means a
 * deletion request quietly disappearing.
 */
function queue_deletion_request(string $email, string $note): bool
{
    $dir = dirname(LOG_FILE);
    if (!is_dir($dir) && !@mkdir($dir, 0750, true) && !is_dir($dir)) {
        return false;
    }

    // Belt and braces alongside the exit guard, for servers that do read it.
    $htaccess = $dir . '/.htaccess';
    if (!file_exists($htaccess)) {
        @file_put_contents($htaccess, "Require all denied\n");
    }

    if (!file_exists(LOG_FILE)) {
        if (@file_put_contents(LOG_FILE, LOG_GUARD, LOCK_EX) === false) {
            return false;
        }
        @chmod(LOG_FILE, 0640);
    } elseif (filesize(LOG_FILE) > LOG_MAX_BYTES) {
        return false;
    }

    // json_encode, not string concatenation: a newline pasted into the note
    // would otherwise forge extra entries in the log.
    $line = json_encode([
        'at'    => gmdate('c'),
        'email' => $email,
        'note'  => $note,
        'done'  => false, // flip by hand once the account has been erased
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

    if ($line === false) {
        return false;
    }
    return @file_put_contents(LOG_FILE, $line . "\n", FILE_APPEND | LOCK_EX) !== false;
}

/** Escape for HTML output. */
function e(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Delete your account — Habit Now</title>
<meta name="description" content="Request deletion of your Habit Now account and everything stored with it, without needing the app installed.">
<meta name="theme-color" content="#BEDDF4">
<meta name="robots" content="index, follow">
<link rel="icon" href="assets/icon.png" type="image/png">
<link rel="apple-touch-icon" href="assets/icon.png">
<link rel="preload" href="assets/fonts/nunito.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="css/site.css?v=20260803">
</head>
<body>

<a class="skiplink" href="#main">Skip to content</a>

<div class="sky" aria-hidden="true">
  <div class="sky__layer is-lit" data-sky="0"></div>
  <div class="clouds">
    <i style="--y:10%; --s:1.2; --d:200s; --o:.72"></i>
    <i style="--y:40%; --s:.8;  --d:270s; --o:.44"></i>
  </div>
</div>

<header class="topbar">
  <a class="wordmark" href="index.html">
    <img src="assets/icon.png" alt="" width="32" height="32">
    <span>Habit&nbsp;Now</span>
  </a>
  <nav class="topnav">
    <a href="support.html">Support</a>
    <a class="topnav__cta" href="index.html#get">Get the app</a>
  </nav>
</header>

<main id="main" class="page">
  <div class="wrap">

    <header class="page__head">
      <div class="pagepet" data-pet="snail_purple" aria-hidden="true"></div>
      <h1>Delete your account</h1>
      <p class="page__stamp">Everything goes. Nothing is kept back.</p>
    </header>

<?php if ($submitted): ?>

    <section class="mailcard" aria-live="polite">
      <h2>Request received</h2>
      <p>
        Your request is in the queue. You'll get an email at the address you
        gave, to confirm it really was you asking — nothing is deleted until you
        reply to that. It's the only thing standing between your account and
        anyone who happens to know your email address.
      </p>
      <p>
        Once confirmed, the account and every row belonging to it are erased
        within <strong>30 days</strong>, and usually within a couple of days.
        Deleting the app removes the local copy on your device straight away.
      </p>
      <a class="mailbtn" href="index.html">Back to the app</a>
    </section>

<?php else: ?>

    <section class="mailcard">
      <h2>Faster from inside the app</h2>
      <p>
        If you still have Habit Now installed, go to
        <strong>Profile → Delete account</strong>. That runs immediately and
        needs no confirmation email, because you're already signed in.
      </p>
      <p>
        This page is for people who've already uninstalled, or who can't sign
        in any more.
      </p>
    </section>

    <h2 class="page__h2" id="what-goes">What gets deleted</h2>

    <div class="faq">
      <details open>
        <summary>Everything tied to your account</summary>
        <div class="faq__a">
          <p>
            Your profile, every habit, every completion, your streaks, your
            experience points, your achievements and your streak freezes. They
            are deleted, not flagged or hidden — the rows stop existing.
          </p>
          <p>
            This does <strong>not</strong> cancel a Pro subscription. Only the
            store can do that: on Android, <strong>Play Store → profile →
            Payments and subscriptions</strong>. Cancel it before or after, but
            do cancel it, or it keeps renewing against a deleted account.
          </p>
          <p>
            See the <a href="privacy.html">privacy policy</a> for the full list
            of what's stored in the first place.
          </p>
        </div>
      </details>
    </div>

    <h2 class="page__h2" id="request">Request it</h2>

    <form class="reqform" method="post" action="delete-account.php" novalidate>

      <?php if (isset($errors['form'])): ?>
        <p class="reqform__alert" role="alert"><?= e($errors['form']) ?></p>
      <?php endif; ?>

      <div class="field">
        <label for="email">Email on the account</label>
        <input
          id="email" name="email" type="email" inputmode="email"
          autocomplete="email" required maxlength="<?= MAX_FIELD_LEN ?>"
          value="<?= e($values['email']) ?>"
          <?= isset($errors['email']) ? 'aria-invalid="true"' : '' ?>
          aria-describedby="email-err">
        <p class="field__err" id="email-err" role="alert"><?= e($errors['email'] ?? '') ?></p>
      </div>

      <div class="field">
        <label for="note">Anything else <span class="field__opt">optional</span></label>
        <textarea
          id="note" name="note" rows="3" maxlength="<?= MAX_NOTE_LEN ?>"
          placeholder="A second address you might have signed up with, for example."
          aria-describedby="note-err"><?= e($values['note']) ?></textarea>
        <p class="field__err" id="note-err" role="alert"><?= e($errors['note'] ?? '') ?></p>
      </div>

      <div class="field">
        <label class="check">
          <input type="checkbox" name="confirm" value="1" required
            <?= isset($errors['confirm']) ? 'aria-invalid="true"' : '' ?>
            aria-describedby="confirm-err">
          <span>
            I understand this permanently deletes my account and everything in
            it, and that it cannot be undone.
          </span>
        </label>
        <p class="field__err" id="confirm-err" role="alert"><?= e($errors['confirm'] ?? '') ?></p>
      </div>

      <!-- Honeypot: positioned off-screen, never shown, never focusable. -->
      <div class="reqform__hp" aria-hidden="true">
        <label for="website">Website</label>
        <input id="website" name="website" type="text" tabindex="-1" autocomplete="off">
      </div>

      <button class="mailbtn" type="submit">Request deletion</button>

      <p class="reqform__foot">
        Prefer email? <a href="mailto:contact.appsnow@gmail.com">contact.appsnow@gmail.com</a>
        reaches the same person.
      </p>
    </form>

<?php endif; ?>

  </div>
</main>

<footer class="foot">
  <div class="wrap foot__inner">
    <p class="foot__mark"><img src="assets/icon.png" alt="" width="28" height="28"> Habit Now</p>
    <nav class="foot__nav">
      <a href="index.html">Home</a>
      <a href="support.html">Support</a>
      <a href="privacy.html">Privacy policy</a>
      <a href="terms.html">Terms of use</a>
      <a href="delete-account.php">Delete account</a>
      <a href="mailto:contact.appsnow@gmail.com">contact.appsnow@gmail.com</a>
    </nav>
    <p class="foot__note">Made by one developer. The tree does the rest.</p>
  </div>
</footer>

<script src="js/site.js" defer></script>
</body>
</html>
