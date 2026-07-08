import { config } from './config.js';
import { checkQueue } from './checker.js';
import { logResult } from './logger.js';
import { SubscriberStore } from './subscribers.js';
import {
  broadcastTelegramMessage,
  formatPossibleSlotsMessage,
  formatStartupMessage,
  formatUnknownMessage,
  pollTelegramCommands,
  seedInitialSubscriber,
} from './telegram.js';
import type { QueueStatus } from './types.js';

const store = new SubscriberStore(config.subscribersFile);

let previousStatus: QueueStatus | undefined;
let lastAlertAt = 0;
let isCheckRunning = false;
let isTelegramPollRunning = false;
let stopped = false;

const intervalMs = Math.round(config.checkIntervalMinutes * 60_000);
const telegramPollingMs = Math.round(config.telegramPollingIntervalSeconds * 1_000);
const cooldownMs = Math.round(config.alertCooldownMinutes * 60_000);
const runOnce = process.argv.includes('--once');

function canSendAlert(): boolean {
  if (cooldownMs === 0) return true;
  return Date.now() - lastAlertAt >= cooldownMs;
}

async function safeBroadcast(text: string): Promise<void> {
  try {
    await broadcastTelegramMessage(config, store.getAll(), text);
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
      await safeBroadcast(formatPossibleSlotsMessage(result));
    }

    if (config.notifyOnUnknown && result.status === 'UNKNOWN' && previousStatus !== 'UNKNOWN' && canSendAlert()) {
      await safeBroadcast(formatUnknownMessage(result));
    }

    previousStatus = result.status;
  } finally {
    isCheckRunning = false;
  }
}

async function runTelegramPoll(): Promise<void> {
  if (isTelegramPollRunning) return;

  isTelegramPollRunning = true;
  try {
    await pollTelegramCommands(config, store, () => checkQueue(config));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[telegram] polling failed: ${message}`);
  } finally {
    isTelegramPollRunning = false;
  }
}

function scheduleNextCheckTick(): void {
  if (stopped) return;

  setTimeout(async () => {
    await runCheck();
    scheduleNextCheckTick();
  }, intervalMs);
}

function scheduleNextTelegramPollTick(): void {
  if (stopped) return;

  setTimeout(async () => {
    await runTelegramPoll();
    scheduleNextTelegramPollTick();
  }, telegramPollingMs);
}

async function main(): Promise<void> {
  await store.load();
  await seedInitialSubscriber(config, store);

  console.log(`Starting Chisinau queue monitor`);
  console.log(`URL: ${config.checkUrl}`);
  console.log(`Interval: ${config.checkIntervalMinutes} minutes`);
  console.log(`Subscribers file: ${config.subscribersFile}`);
  console.log(`Subscribers: ${store.count()}`);

  await runTelegramPoll();

  if (config.startupNotify) {
    await safeBroadcast(formatStartupMessage(config, store.count()));
  }

  await runCheck();

  if (runOnce) {
    console.log('Run-once mode finished.');
    return;
  }

  scheduleNextCheckTick();
  scheduleNextTelegramPollTick();
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
