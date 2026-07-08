# Chisinau Queue Bot

Telegram bot for monitoring Passport Service e-queue slots in Chisinau.

## Railway variables

```env
TELEGRAM_BOT_TOKEN=...
CHECK_INTERVAL_MINUTES=2
ALERT_COOLDOWN_MINUTES=30
STARTUP_NOTIFY=true
TELEGRAM_POLLING_INTERVAL_SECONDS=5
SUBSCRIBERS_FILE=/data/subscribers.json
```

`TELEGRAM_CHAT_ID` is optional. Normally users subscribe with `/start`.

## Commands

- `/start` — subscribe and show buttons
- `/stop` — unsubscribe
- `/status` — check current status now

## Railway

Deploy as a normal Node service. `railway.json` explicitly runs:

- build: `npm run build`
- start: `npm run start`

This version intentionally has no runtime dependencies and no `package-lock.json` to avoid lockfiles containing private registry URLs.
