# location-trigger

Clocks in and out of the company ERP from an iPhone. iOS Shortcuts location automations
(Arrive, Leave) run Scriptable scripts; the scripts keep a small daily state, sign in through
the ERP's Keycloak login and post notifications. Design: `docs/architecture.md`.

## Layout
- `lib/` - shared modules, CommonJS (`module.exports`), loaded by Scriptable's `importModule()`
  and by Node's `require()`. Pure logic only, or Scriptable APIs passed in as parameters, so
  every module here runs under `node --test`.
- `scripts/` - top-level Scriptable scripts. Thin: read storage, call `lib/`, talk to iOS.
  They use Scriptable globals (`Request`, `Notification`, `Alert`) and cannot run in Node.
- `test/` - `node:test` files, one per `lib/` module. No npm dependencies.
- `docs/architecture.md` - the single design document. No ADRs in this repository.

## Gate
- `node --test` (Node 20 or later) for every change to `lib/` or `test/`.
- Changes to `scripts/` cannot be unit-tested: say so in the commit body, and list the
  on-device check as `NOT VERIFIED: iPhone: <check>` in the PR until Kade has run it.

## Public repository
- Nothing that identifies the company or the user goes in git: no ERP or Keycloak URLs,
  usernames, passwords, coordinates or captured requests. They are entered in `Setup` on the
  phone and live in Scriptable's local storage and the iOS Keychain.
- Test fixtures use `example.com` hosts and made-up values.
- `*.har` is ignored; scrub any capture before it is quoted in an issue or PR.

## Flow
- Branches `claude/<task>` (Claude) or `agent/<task>` (other agents), PR into `main`.
- State lives in this repository's open issues and PRs.

## Overrides of global rules
- None.
