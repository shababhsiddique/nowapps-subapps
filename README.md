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
   `~/nowapps-websites.deploy.request`. That is all it does.
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
mkdir -p ~/nowapps.cc
git clone git@github-nowapps:shababhsiddique/nowapps-subapps.git ~/nowapps.cc/websites
#    (SSH via the host alias set up under "Credentials" below. The repo is
#     private, and cron has no terminal to type a password into.)

# 2. Secrets
cd ~/nowapps.cc/websites
cp .env.example .env
openssl rand -hex 32   # → DEPLOY_TOKEN
openssl rand -hex 32   # → GITHUB_WEBHOOK_SECRET
chmod 600 .env

# 3. Cron, every minute
crontab -e
# * * * * * /home/shababhs/nowapps.cc/websites/tools/deploy-cron.sh >/dev/null 2>&1
```

Then in GitHub → Settings → Webhooks → Add webhook:

- **Payload URL** `https://<domain>/deploy.php`
- **Content type** `application/json`
- **Secret** the `GITHUB_WEBHOOK_SECRET` value
- **Events** just the push event

Saving it sends a ping; the script answers `pong`, which is the handshake
confirming the secret matches on both ends.

If the checkout is owned by a different user than cron runs as, git refuses to
touch it — `git config --global --add safe.directory /home/shababhs/nowapps.cc/websites`.

### Credentials

The repo is private, so the pull has to authenticate — and cron has no terminal,
so it has to do that without ever asking. Use a **deploy key**: an SSH keypair
that grants read-only access to this one repo and nothing else on the account.

```bash
# On the server, no passphrase — cron cannot type one:
ssh-keygen -t ed25519 -C "nowapps-subapps deploy" -f ~/.ssh/nowapps_deploy -N ""
cat ~/.ssh/nowapps_deploy.pub
```

Paste that public key into GitHub → the repo → Settings → Deploy keys → Add
deploy key. Leave *Allow write access* unchecked; the server only ever pulls.

This server already carries the bilgi deploy key, and both repos live at
`github.com`. In `~/.ssh/config` the first matching `Host github.com` block wins
for a given keyword, so a second one would never be consulted — the new key
needs its **own host alias**:

```bash
cat >> ~/.ssh/config <<'EOF'

Host github-nowapps
    HostName github.com
    User git
    IdentityFile ~/.ssh/nowapps_deploy
    IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config ~/.ssh/nowapps_deploy

# Trust the host once, so the first cron pull isn't blocked on a yes/no prompt:
ssh-keyscan github.com >> ~/.ssh/known_hosts

# Point the checkout at the alias — github-nowapps, not github.com:
cd ~/nowapps.cc/websites
git remote set-url origin git@github-nowapps:shababhsiddique/nowapps-subapps.git

# Verify. Must prompt for nothing, and must greet you as the *right* repo:
ssh -T git@github-nowapps
#   Hi shababhsiddique/nowapps-subapps!   ← correct
#   Hi shababhsiddique/bilgi!             ← wrong key, ssh matched the other block
git pull --ff-only origin master
```

A deploy key authenticates as `owner/repo` rather than as a user, which is why
that greeting is the whole test: it names which key ssh actually sent. Deploy
keys do not expire, so this is one-time setup.

**If the host blocks outbound SSH** (some shared hosts do — `ssh -T git@github.com`
hangs or is refused), fall back to a token over HTTPS. Create a fine-grained
personal access token scoped to this one repo with *Contents: Read-only*, then:

```bash
git config --global credential.helper store
cd ~/nowapps.cc/websites
git remote set-url origin https://github.com/shababhsiddique/nowapps-subapps.git
git pull origin master     # username: your GitHub username, password: the token
chmod 600 ~/.git-credentials
```

The first pull writes the token to `~/.git-credentials` in **plaintext** and
every later pull reads it from there. Set an expiry you'll actually remember,
because a token that lapses breaks deploys silently until you look at the log.

`deploy-cron.sh` sets `GIT_TERMINAL_PROMPT=0` and `ssh -o BatchMode=yes`, so if
credentials ever go missing the pull fails and says so in the log rather than
hanging forever holding the lock.

### Watching it

```bash
tail -f ~/nowapps-websites.deploy.log
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
