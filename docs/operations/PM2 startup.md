# pm2 startup chat

## One extra verification (optional)

From the box:

```bash
curl -s https://api-dev.perfectdocroot.com/v1/health
pm2 ls
```

If both return clean, call it done.

---

# How `pm2 startup` works (macOS focus)

There are **two** pieces:

## A) `pm2 save` (persist the process list)

This writes your current PM2 process list to:

* `~/.pm2/dump.pm2`

Run any time you change what should auto-start:

```bash
pm2 save
```

## B) `pm2 startup` (install auto-start hook)

This generates an OS-specific startup integration so that:

* PM2 daemon starts on boot/login
* PM2 resurrects the saved process list (`dump.pm2`)

On macOS, this is typically via **launchd** (LaunchAgent).

Run:

```bash
pm2 startup
```

PM2 will print a command you must run next (usually with `sudo`), something like:

```bash
sudo env PATH=$PATH:/opt/homebrew/bin pm2 startup launchd -u robertvoigt --hp /Users/robertvoigt
```

**Do not improvise**—copy/paste the exact command PM2 outputs.

Then:

```bash
pm2 save
```

(Yes, save again after startup is installed—this ensures the dump file is current.)

---

## Verifying startup is correctly installed

### 1) Confirm the dump exists

```bash
ls -la ~/.pm2/dump.pm2
```

### 2) Simulate a “PM2 daemon restart”

```bash
pm2 kill
pm2 resurrect
pm2 ls
```

You should see `pdr-api` and `pdr-worker` come back online.

### 3) On macOS: check the LaunchAgent (optional)

After `pm2 startup`, you’ll usually have a plist like:

```bash
ls -la ~/Library/LaunchAgents | grep -i pm2
```

---

## Your best practice operator flow

When you change code and want to restart both:

```bash
pm2 reload ecosystem.config.js
```

When you change env files and need a hard restart:

```bash
pm2 restart ecosystem.config.js --update-env
```

When you change the process list (add/remove apps):

```bash
pm2 save
```

---

## One small improvement to your ecosystem file

Right now your `ecosystem.config.js` hard-codes `REPO_ROOT`. To make it portable:

```js
const REPO_ROOT = __dirname;
```

That way the ecosystem file works even if you move/clone the repo elsewhere.

---

That output is correct for **macOS + Homebrew Node**. PM2 detected `launchd` and generated the command to install a **LaunchAgent** for your user. You should run **exactly** what it printed.

## 1) Run the generated command

Copy/paste this line exactly:

```bash
sudo env PATH=$PATH:/usr/local/bin /opt/homebrew/lib/node_modules/pm2/bin/pm2 startup launchd -u robertvoigt --hp /Users/robertvoigt
```

What this does:

* Creates a **launchd agent** under your user.
* Configures it to start the PM2 daemon when macOS logs you in.
* Tells PM2 where your home directory is (`--hp /Users/robertvoigt`).
* Ensures the correct Node path is available.

---

## 2) Persist the running processes

After the startup hook is installed, run:

```bash
pm2 save
```

This writes your current running processes to:

```
~/.pm2/dump.pm2
```

Your dump should now include:

* `pdr-api`
* `pdr-worker`

---

## 3) Verify everything works

### Check the dump file

```bash
ls -l ~/.pm2/dump.pm2
```

### Simulate a reboot scenario

Kill the PM2 daemon and resurrect:

```bash
pm2 kill
pm2 resurrect
pm2 ls
```

You should see:

```
pdr-api      online
pdr-worker   online
```

---

## 4) Verify the launchd agent exists (optional)

On macOS, PM2 creates a LaunchAgent plist:

```bash
ls ~/Library/LaunchAgents | grep pm2
```

You should see something like:

```
pm2.robertvoigt.plist
```

That file tells macOS to start PM2 automatically when you log in.

---

## 5) Your new normal workflow

Start everything:

```bash
pm2 start ecosystem.config.js
```

Reload after code change:

```bash
pm2 reload ecosystem.config.js
```

Restart after env change:

```bash
pm2 restart ecosystem.config.js --update-env
```

Persist changes:

```bash
pm2 save
```

View logs:

```bash
pm2 logs
```

---

## Small improvement I recommend

Update your ecosystem file to avoid hard-coding the path:

```js
const REPO_ROOT = __dirname;
```

That makes the repo portable if you clone it elsewhere.

---

One small “operator” habit that will keep you sane

When you change anything and want to validate fast, do this trio:

```bash
curl -s https://api-dev.perfectdocroot.com/v1/health
pm2 ls
pm2 logs pdr-worker --lines 20

If those are clean, you’re operational.
```
