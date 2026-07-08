import dotenv from 'dotenv';

dotenv.config();

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
  telegramChatId: requiredEnv('TELEGRAM_CHAT_ID'),
  checkUrl: process.env.CHECK_URL?.trim() || 'https://chisinau.pasport.org.ua/solutions/e-queue',
  checkIntervalMinutes: optionalNumberEnv('CHECK_INTERVAL_MINUTES', 2, 0.1),
  alertCooldownMinutes: optionalNumberEnv('ALERT_COOLDOWN_MINUTES', 30, 0),
  checkTimeoutMs: optionalNumberEnv('CHECK_TIMEOUT_MS', 20_000, 1_000),
  startupNotify: optionalBooleanEnv('STARTUP_NOTIFY', false),
  notifyOnUnknown: optionalBooleanEnv('NOTIFY_ON_UNKNOWN', false),
  logHtmlSnippetOnUnknown: optionalBooleanEnv('LOG_HTML_SNIPPET_ON_UNKNOWN', false),
  userAgent:
    process.env.USER_AGENT?.trim() ||
    'Mozilla/5.0 (compatible; ChisinauQueueMonitor/1.0; +https://railway.app)',
};

export type AppConfig = typeof config;
