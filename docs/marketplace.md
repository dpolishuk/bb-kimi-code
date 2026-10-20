# The bb-kimi-code marketplace

This repository doubles as a bb **marketplace**: the `marketplace.json` at its
root lists the plugin with store branding and a git source. bb never hosts
plugin code — installing a marketplace entry runs the same install pipeline as
a direct install.

## For users: add the marketplace to bb

```
bb marketplace add git:github.com/dpolishuk/bb-kimi-code@main
bb marketplace list
```

Then open **Settings → Plugins → Marketplace** in bb (or
`bb plugin install kimi-code` flows from the catalog) and install **Kimi
Code** from the **Kimi Code for bb** catalog. Before installing, bb shows the
true resolved source — the repository, the release tag, and the exact commit.

Useful commands:

```
bb marketplace refresh kimi-code     # re-read the catalog and icons
bb plugin outdated                   # see newer compatible releases
bb plugin update kimi-code           # move to the latest release in ^0.1.0
bb marketplace remove kimi-code      # forget the catalog; installed plugins stay
```

The catalog entry installs the highest `vX.Y.Z` tag matching `^0.1.0`, and
`bb plugin update` tracks later releases in that range.

### Direct install instead

No marketplace needed if you prefer:

```
bb plugin install https://github.com/dpolishuk/bb-kimi-code
bb plugin install git:https://github.com/dpolishuk/bb-kimi-code.git@^0.1.0
```

A bare URL tracks the default branch; the `git:` range form tracks releases.

## For maintainers: how a release reaches the marketplace

1. Land changes on `main`; bump `version` in `package.json`.
2. Verify: `npm test`, `npm run typecheck`, `npm run build`
   (`bb plugin build`), plus the live suite when the bridge is touched.
3. Tag the release and push:

   ```
   git tag v0.2.0
   git push origin main --tags
   ```

4. Done — the `range: "^0.1.0"` entry resolves the highest matching tag on
   the next `bb marketplace refresh` / `bb plugin outdated`. No catalog edit
   is needed for releases inside the range.

Rules that bb enforces (from its distribution contract):

- A tag must never be moved to another commit — bb records tag + commit and
  refuses a moved tag. Publish a fix as a new version.
- `engines.bb` / `engines.bbPluginSdk` in `package.json` gate updates:
  incompatible releases are reported as blocked. Keep the ranges honest.
- `marketplace.json` is validated strictly (schema version 1 rejects unknown
  fields); a rejected manifest leaves the last valid catalog serving.

## Listing in bb-community

bb ships two built-in catalogs: `bb-official` (bundled plugins, a bb release
decision) and `bb-community` (public third-party plugins). To list this plugin
in `bb-community`, use bb's `submit-a-plugin` skill — it copies
`PLUGIN_OVERVIEW.md` (already in this repo, following the store text rules)
into the marketplace repository and opens the submission.
