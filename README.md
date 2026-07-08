# Chisinau Queue Bot

Telegram bot for monitoring the Chisinau Passport Service e-queue page.

This build has the anti-403 request profile hardcoded in `src/config.ts`:

- `WARMUP_REQUEST=true`
- Chrome-like `USER_AGENT`
- Ukrainian/Russian/English `ACCEPT_LANGUAGE`

You do **not** need to add `WARMUP_REQUEST`, `USER_AGENT`, or `ACCEPT_LANGUAGE` in Railway Variables.

## Railway variables

Required:

```env
TELEGRAM_BOT_TOKEN=123456:ABC...
```

Recommended:

```env
CHECK_URL=https://chisinau.pasport.org.ua/solutions/e-queue
CHECK_INTERVAL_MINUTES=2
ALERT_COOLDOWN_MINUTES=30
TELEGRAM_POLLING_INTERVAL_SECONDS=5
SUBSCRIBERS_FILE=/data/subscribers.json
STARTUP_NOTIFY=false
```

Optional first subscriber seed:

```env
TELEGRAM_CHAT_ID=743752486
```

Usually you do not need `TELEGRAM_CHAT_ID`, because users subscribe with `/start`.

## Commands

- `/start` — subscribe
- `/stop` — unsubscribe
- `/status` — check current status immediately

The bot also shows buttons after `/start`:

- `🔎 Проверить статус сейчас`
- `🌐 Открыть страницу записи`
