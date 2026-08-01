# nowapps subapps

Marketing and legal sites for the Now Apps family, one directory per app. The
git checkout **is** the document root on the server, so a `git push` is the
deploy.

```
habit/                 Habit Now — see habit/README.md
deploy.php             deploy trigger (webhook + manual)  → /deploy.php
tools/deploy-cron.sh   the cron half of the deploy
.env                   deploy secrets, never committed
```

---

## Deploying

The host disables `exec()`/`shell_exec()`, so PHP cannot run git. The deploy is
split in two:

1. **`deploy.php`** authenticates the request and writes a flag file at
   `~/nowapps-subapps.deploy.request`. That is all it does.
2. **`tools/deploy-cron.sh`** runs from cron every minute. If the flag is there
   it consumes it and runs `git pull --ff-only origin master`.

So a push is live within about a minute. Same mechanism as the bilgi repo.

### Triggering

| | |
|---|---|
| GitHub push to `master` | webhook → automatic |
| Manual | `curl https://<domain>/deploy.php?token=<DEPLOY_TOKEN>` |

Anything else — an unsigned POST, a wrong token, a push to another branch — is
refused (`403`) or ignored (`202`) without writing the flag.

### Server setup (once)

```bash
# 1. Clone so the repo root is the document root
git clone https://github.com/shababhsiddique/nowapps-subapps.git ~/nowapps-subapps

# 2. Secrets
cd ~/nowapps-subapps
cp .env.example .env
openssl rand -hex 32   # → DEPLOY_TOKEN
openssl rand -hex 32   # → GITHUB_WEBHOOK_SECRET
chmod 600 .env

# 3. Cron, every minute
crontab -e
# * * * * * /home/shababhs/nowapps-subapps/tools/deploy-cron.sh >/dev/null 2>&1
```

Then in GitHub → Settings → Webhooks → Add webhook:

- **Payload URL** `https://<domain>/deploy.php`
- **Content type** `application/json`
- **Secret** the `GITHUB_WEBHOOK_SECRET` value
- **Events** just the push event

Saving it sends a ping; the script answers `pong`, which is the handshake
confirming the secret matches on both ends.

If the checkout is owned by a different user than cron runs as, git refuses to
touch it — `git config --global --add safe.directory /home/shababhs/nowapps-subapps`.

### Watching it

```bash
tail -f ~/nowapps-subapps.deploy.log
```

Every run appends: what asked for the deploy, and either the commit range that
landed, `already up to date`, or the git error verbatim.

### When it does not deploy

The pull is `--ff-only` and never `reset --hard`, because the checkout is also
the docroot and holds untracked runtime data (`habit/data/`, the account
deletion requests). A fast-forward cannot touch either. The cost is that a
commit made *on the server* diverges the branch and every deploy then fails
with `Not possible to fast-forward` — the site keeps serving the last good
commit until you go clear the local commit by hand. Don't commit on the server.

Other things worth knowing:

- The flag is consumed **before** the pull, so a push that lands mid-deploy
  writes a fresh flag and gets its own run rather than being swallowed.
- Concurrent runs are held off with `flock`; a run that finds the lock taken
  leaves the flag for the next minute.
- `deploy-cron.sh` wraps its body in a function on purpose. Bash reads a script
  lazily, and this script can rewrite itself mid-run via `git pull`; a function
  is parsed in full before it executes, so it can't be corrupted halfway.

### What is not web content

The docroot and the repo are the same directory, so the root `.htaccess` denies
what should never be served: dotfiles (`.env`, `.git`), `*.sh`, `*.py`, `*.md`,
`*.log`, and `tools/`. Anything non-public added to the repo later needs to fit
one of those patterns or get its own rule.
