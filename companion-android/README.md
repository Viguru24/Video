# COSMO Symphony Companion (Android)

Companion application for the COSMO Symphony music and video composition system.

## Sovereign Over-The-Air (OTA) Updates
Updates are delivered directly from your self-hosted sovereign VPS (`https://api.cosmowhisper.com/updates/cosmo-companion`).

- **Automatic Check:** Checks on startup and presents an update alert banner.
- **Manual Check:** In Settings -> **Check for Updates**.
- **One-Click Release:** Double-click `PUBLISH_UPDATE.bat` or run `.\publish-update.ps1` to compile, auto-increment version, and deploy to live production.

See [OTA_UPDATE_GUIDE.md](OTA_UPDATE_GUIDE.md) for full endpoint specifications.
