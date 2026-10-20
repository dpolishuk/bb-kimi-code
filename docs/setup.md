# Setting up bb-kimi-code

Step-by-step: from zero to a Kimi Code thread in bb, locally and on a remote
host.

## 1. Install bb

Desktop app (macOS Apple Silicon recommended) from
[getbb.app](https://getbb.app/), or run anywhere with Node:

```
npx bb-app@latest
```

npm 12+ blocks dependency install scripts by default; bb needs them for its
native add-ons:

```
npx --allow-scripts=better-sqlite3,node-pty,@parcel/watcher bb-app@latest
```

Open bb at the printed address (default `http://localhost:38886`).

## 2. Install the bb CLI

In the bb app: **Settings → General → Command line → Install**. Verify:

```
bb --help
```

## 3. Install Kimi Code CLI

On every machine that should run Kimi Code threads:

```
curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash
```

(Windows: `irm https://code.kimi.com/kimi-code/install.ps1 | iex`.)

You can skip this step on a host and let bb install Kimi Code later from the
provider card — this plugin declares an install plan — but doing it manually
first makes the first run smoother.

## 4. Sign in to Kimi Code

On the same machine:

```
kimi login
```

Follow the device-code flow. Check that it worked:

```
kimi --version
```

## 5. Install the plugin

From a local clone:

```
git clone https://github.com/dpolishuk/bb-kimi-code.git
bb plugin install ./bb-kimi-code
```

bb builds the plugin's server and host bundles during install. Verify:

```
bb plugin list
```

`kimi-code` should appear as loaded.

## 6. Run a thread

1. Open bb → **New Thread**.
2. Pick **Kimi Code** in the provider picker.
3. Pick a model (e.g. `kimi-code/k3`) and a thinking level.
4. Send a prompt.

Optional — make Kimi Code the default provider:

```
bb settings general defaultProviderId kimi-code
```

## 7. Remote hosts

1. Enroll the remote machine to your bb server (bb's host-daemon flow — see
   bb's "Using bb on multiple devices" doc).
2. Make sure `kimi` is installed and signed in **on that host**
   (steps 3–4), or open the provider's card in bb Settings and let the plugin
   install it there.
3. Start a thread on that host and pick **Kimi Code** — bb delivers the
   plugin's bridge artifact to the host automatically (digest-verified) and
   runs `kimi acp` there.

## Troubleshooting

| Symptom | Check |
|---|---|
| Provider shows "not installed" on a host | `kimi` missing on that host — use the provider card's Install action or step 3 |
| Provider shows "unauthenticated" | run `kimi login` on the host, then reload the plugin or retry the thread |
| Reasoning picker shows only "Thinking On" | a stale `kimi` shadows the real one on that host: `which -a kimi` — remove the old one (e.g. Homebrew's 0.x `kimi-code`), then let bb re-probe |
| Provider missing from the picker | `bb plugin list` — the plugin must be loaded; reinstall with `bb plugin install ./bb-kimi-code` |
| Model list is empty | the first `model/list` probe may need a few seconds; it also requires a signed-in `kimi` |
| Plugin changes not picked up | `bb plugin reload kimi-code` |

## For contributors

Development loop, tests, and the live-test suite: see the README's
Development section and [docs/architecture.md](architecture.md).
