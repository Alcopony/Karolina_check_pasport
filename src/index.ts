import { config } from './config.js';
import { checkQueue } from './checker.js';
import { logResult } from './logger.js';
import {
  formatPossibleSlotsMessage,
  formatStartupMessage,
  formatUnknownMessage,
  sendTelegramMessage,
} from './telegram.js';
import type { QueueStatus } from './types.js';

let previousStatus: QueueStatus | undefined;
let lastAlertAt = 0;
let isCheckRunning = false;
let stopped = false;

const intervalMs = Math.round(config.checkIntervalMinutes * 60_000);
const cooldownMs = Math.round(config.alertCooldownMinutes * 60_000);
const runOnce = process.argv.includes('--once');

function canSendAlert(): boolean {
  if (cooldownMs === 0) return true;
  return Date.now() - lastAlertAt >= cooldownMs;
}

async function safeSend(text: string): Promise<void> {
  try {
    await sendTelegramMessage(config, text);
    lastAlertAt = Date.now();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[telegram] ${message}`);
  }
}

async function runCheck(): Promise<void> {
  if (isCheckRunning) {
    console.warn(`[${new Date().toISOString()}] Previous check is still running, skipping this tick.`);
    return;
  }

  isCheckRunning = true;

  try {
    const result = await checkQueue(config);
    logResult(result, config.logHtmlSnippetOnUnknown && result.status === 'UNKNOWN');

    const changedToPossibleSlots = previousStatus !== 'POSSIBLE_SLOTS' && result.status === 'POSSIBLE_SLOTS';
    const shouldNotifyPossibleSlots = changedToPossibleSlots || (result.status === 'POSSIBLE_SLOTS' && canSendAlert());

    if (shouldNotifyPossibleSlots && canSendAlert()) {
      await safeSend(formatPossibleSlotsMessage(result));
    }

    if (config.notifyOnUnknown && result.status === 'UNKNOWN' && previousStatus !== 'UNKNOWN' && canSendAlert()) {
      await safeSend(formatUnknownMessage(result));
    }

    previousStatus = result.status;
  } finally {
    isCheckRunning = false;
  }
}

function scheduleNextTick(): void {
  if (stopped) return;

  setTimeout(async () => {
    await runCheck();
    scheduleNextTick();
  }, intervalMs);
}

async function main(): Promise<void> {
  console.log(`Starting Chisinau queue monitor`);
  console.log(`URL: ${config.checkUrl}`);
  console.log(`Interval: ${config.checkIntervalMinutes} minutes`);

  if (config.startupNotify) {
    await safeSend(formatStartupMessage(config));
  }

  await runCheck();

  if (runOnce) {
    console.log('Run-once mode finished.');
    return;
  }

  scheduleNextTick();
}

function shutdown(signal: string): void {
  console.log(`${signal} received. Stopping after current check.`);
  stopped = true;
  setTimeout(() => process.exit(0), 500).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
