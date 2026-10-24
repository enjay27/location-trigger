# location-trigger

Clocks in to the company ERP when the iPhone arrives at the office, and reminds you to clock
out when it leaves. Runs on the phone only: iOS Shortcuts location automations start
[Scriptable](https://scriptable.app) scripts. There is no server.

See [docs/architecture.md](docs/architecture.md) for the design.

## Install on the iPhone
1. Install Scriptable from the App Store.
2. Copy `scripts/*.js` into `iCloud Drive/Scriptable/`, and `lib/*.js` into
   `iCloud Drive/Scriptable/lib/` (on a Mac, Finder → iCloud Drive → Scriptable).
3. Run `Setup` in Scriptable once and enter the ERP address, Keycloak host, username,
   password, time window, reset time and exit grace period. The password goes to the iOS
   Keychain; nothing is written back to iCloud Drive.
4. Run `Spike` in Scriptable. Its notification reports whether the sign-in reaches the ERP
   and whether a location fix is available. It does not clock in or out.
5. In Shortcuts → Automation, add an "Arrive" automation at the office (radius 150 m or
   more), set to Run Immediately, whose only action is Scriptable's "Run Script" with
   `Spike`. Lock the phone, arrive, and check for the "Spike ran" notification.

## Test
```bash
node --test
```
