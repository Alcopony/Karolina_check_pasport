function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalNumberEnv(name: string, defaultValue: number, minValue?: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return defaultValue;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a valid number. Received: ${raw}`);
  }

  if (minValue !== undefined && parsed < minValue) {
    throw new Error(`${name} must be >= ${minValue}. Received: ${raw}`);
  }

  return parsed;
}

function optionalBooleanEnv(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return defaultValue;

  if (['true', '1', 'yes', 'y', 'on'].includes(raw)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(raw)) return false;

  throw new Error(`${name} must be boolean: true/false. Received: ${raw}`);
}

export const config = {
  telegramBotToken: requiredEnv('TELEGRAM_BOT_TOKEN'),
  initialTelegramChatId: process.env.TELEGRAM_CHAT_ID?.trim() || '',
  checkUrl: process.env.CHECK_URL?.trim() || 'https://chisinau.pasport.org.ua/solutions/e-queue',
  checkIntervalMinutes: optionalNumberEnv('CHECK_INTERVAL_MINUTES', 2, 0.1),
  alertCooldownMinutes: optionalNumberEnv('ALERT_COOLDOWN_MINUTES', 30, 0),
  checkTimeoutMs: optionalNumberEnv('CHECK_TIMEOUT_MS', 20_000, 1_000),
  startupNotify: optionalBooleanEnv('STARTUP_NOTIFY', false),
  notifyOnUnknown: optionalBooleanEnv('NOTIFY_ON_UNKNOWN', false),
  telegramPollingIntervalSeconds: optionalNumberEnv('TELEGRAM_POLLING_INTERVAL_SECONDS', 5, 1),
  subscribersFile: process.env.SUBSCRIBERS_FILE?.trim() || './data/subscribers.json',
  logHtmlSnippetOnUnknown: optionalBooleanEnv('LOG_HTML_SNIPPET_ON_UNKNOWN', false),
  // Hardcoded anti-403 request profile. Do not set these in Railway Variables.
  warmupRequest: true,
  acceptLanguage: 'uk-UA,uk;q=0.9,ru-RU;q=0.8,ru;q=0.7,en-US;q=0.6,en;q=0.5',
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
};

export type AppConfig = typeof config;
