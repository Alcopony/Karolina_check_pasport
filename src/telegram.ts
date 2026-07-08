import type { AppConfig } from './config.js';
import type { Subscriber, SubscriberStore } from './subscribers.js';
import type { QueueCheckResult } from './types.js';

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

type TelegramChat = {
  id: number;
  type?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
};

type TelegramMessage = {
  message_id: number;
  text?: string;
  chat: TelegramChat;
};

type TelegramCallbackQuery = {
  id: string;
  from: {
    id: number;
    username?: string;
    first_name?: string;
    last_name?: string;
  };
  message?: TelegramMessage;
  data?: string;
};

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

type TelegramApiResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

type InlineKeyboardMarkup = {
  inline_keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>>;
};

const STATUS_CALLBACK_DATA = 'check_status';

function mainKeyboard(url: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: '🔎 Проверить статус сейчас', callback_data: STATUS_CALLBACK_DATA }],
      [{ text: '🌐 Открыть страницу записи', url }],
    ],
  };
}

async function telegramRequest<T>(config: AppConfig, method: string, body: Record<string, unknown>): Promise<T> {
  const endpoint = `https://api.telegram.org/bot${config.telegramBotToken}/${method}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const responseText = await response.text();

  let data: TelegramApiResponse<T>;
  try {
    data = JSON.parse(responseText) as TelegramApiResponse<T>;
  } catch {
    throw new Error(`Telegram ${method} failed: invalid JSON response: ${responseText}`);
  }

  if (!response.ok || !data.ok) {
    throw new Error(
      `Telegram ${method} failed: HTTP ${response.status} ${data.description || responseText}`,
    );
  }

  return data.result as T;
}

export async function sendTelegramMessage(
  config: AppConfig,
  chatId: number | string,
  text: string,
  replyMarkup?: InlineKeyboardMarkup,
): Promise<void> {
  await telegramRequest(config, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: false,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

export async function answerCallbackQuery(
  config: AppConfig,
  callbackQueryId: string,
  text?: string,
): Promise<void> {
  await telegramRequest(config, 'answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
  });
}

export async function getTelegramUpdates(
  config: AppConfig,
  offset?: number,
): Promise<TelegramUpdate[]> {
  return telegramRequest<TelegramUpdate[]>(config, 'getUpdates', {
    offset,
    timeout: 0,
    allowed_updates: ['message', 'callback_query'],
  });
}

export async function broadcastTelegramMessage(
  config: AppConfig,
  subscribers: Subscriber[],
  text: string,
): Promise<void> {
  if (subscribers.length === 0) {
    console.warn('[telegram] No subscribers. Nobody will receive this message.');
    return;
  }

  const failed: string[] = [];

  for (const subscriber of subscribers) {
    try {
      await sendTelegramMessage(config, subscriber.chatId, text, mainKeyboard(config.checkUrl));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failed.push(`${subscriber.chatId}: ${message}`);
    }
  }

  if (failed.length > 0) {
    console.error(`[telegram] Failed to send to ${failed.length}/${subscribers.length} subscribers`);
    for (const failure of failed) console.error(`[telegram] ${failure}`);
  }
}

export async function seedInitialSubscriber(
  config: AppConfig,
  store: SubscriberStore,
): Promise<void> {
  if (!config.initialTelegramChatId) return;

  const parsed = Number(config.initialTelegramChatId);
  if (!Number.isFinite(parsed)) {
    console.warn('[telegram] TELEGRAM_CHAT_ID is set but is not a numeric chat id. Ignoring it.');
    return;
  }

  const added = await store.addOrUpdate({ chatId: parsed, type: 'private' });
  if (added) {
    console.log(`[telegram] Seeded initial subscriber from TELEGRAM_CHAT_ID: ${parsed}`);
  }
}

export async function pollTelegramCommands(
  config: AppConfig,
  store: SubscriberStore,
  getCurrentStatus: () => Promise<QueueCheckResult>,
): Promise<void> {
  const updates = await getTelegramUpdates(config, store.getUpdateOffset());

  for (const update of updates) {
    await store.setUpdateOffset(update.update_id + 1);

    const callbackQuery = update.callback_query;
    if (callbackQuery?.data === STATUS_CALLBACK_DATA) {
      const chatId = callbackQuery.message?.chat.id ?? callbackQuery.from.id;
      await answerCallbackQuery(config, callbackQuery.id, 'Проверяю статус...');

      try {
        const result = await getCurrentStatus();
        await sendTelegramMessage(config, chatId, formatCurrentStatusMessage(result), mainKeyboard(config.checkUrl));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await sendTelegramMessage(
          config,
          chatId,
          `🔴 <b>Не удалось проверить статус</b>\n\n<code>${escapeHtml(message)}</code>`,
          mainKeyboard(config.checkUrl),
        );
      }

      console.log(`[telegram] status button from ${chatId}`);
      continue;
    }

    const message = update.message;
    const text = message?.text?.trim();
    if (!message || !text) continue;

    const command = text.split(/\s+/)[0].split('@')[0].toLowerCase();

    if (command === '/start') {
      const isNew = await store.addOrUpdate({
        chatId: message.chat.id,
        type: message.chat.type,
        username: message.chat.username,
        firstName: message.chat.first_name,
        lastName: message.chat.last_name,
      });

      await sendTelegramMessage(
        config,
        message.chat.id,
        [
          isNew ? '✅ Вы подписались на уведомления.' : '✅ Вы уже подписаны, данные обновлены.',
          '',
          'Я напишу сюда, если на странице электронной очереди Кишинёва появятся признаки свободных окон.',
          '',
          'Нажмите кнопку ниже, чтобы проверить текущий статус вручную.',
          'Команда /status делает то же самое текстовой командой.',
          'Команда /stop отключает уведомления.',
        ].join('\n'),
        mainKeyboard(config.checkUrl),
      );

      console.log(`[telegram] /start from ${message.chat.id}. Subscribers: ${store.count()}`);
    }

    if (command === '/status') {
      await sendTelegramMessage(config, message.chat.id, '⏳ Проверяю текущий статус...');
      try {
        const result = await getCurrentStatus();
        await sendTelegramMessage(config, message.chat.id, formatCurrentStatusMessage(result), mainKeyboard(config.checkUrl));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await sendTelegramMessage(
          config,
          message.chat.id,
          `🔴 <b>Не удалось проверить статус</b>\n\n<code>${escapeHtml(errorMessage)}</code>`,
          mainKeyboard(config.checkUrl),
        );
      }

      console.log(`[telegram] /status from ${message.chat.id}`);
    }

    if (command === '/stop') {
      const removed = await store.remove(message.chat.id);
      await sendTelegramMessage(
        config,
        message.chat.id,
        removed
          ? '🛑 Вы отписались от уведомлений. Чтобы включить снова, отправьте /start.'
          : 'Вы не были подписаны. Чтобы подписаться, отправьте /start.',
      );

      console.log(`[telegram] /stop from ${message.chat.id}. Subscribers: ${store.count()}`);
    }
  }
}

export function formatCurrentStatusMessage(result: QueueCheckResult): string {
  const checkedAt = result.checkedAt.toISOString();
  const httpStatus = result.httpStatus ?? 'unknown';

  if (result.status === 'NO_SLOTS') {
    const negative = result.matchedNegativePhrases.length
      ? result.matchedNegativePhrases.join(', ')
      : 'страница выглядит как «мест нет»';

    return [
      '🔴 <b>Сейчас мест не видно</b>',
      '',
      `Проверено: <code>${escapeHtml(checkedAt)}</code>`,
      `HTTP: <code>${httpStatus}</code>`,
      `Найдено: <code>${escapeHtml(negative)}</code>`,
      '',
      `Страница: ${escapeHtml(result.url)}`,
    ].join('\n');
  }

  if (result.status === 'POSSIBLE_SLOTS') {
    return formatPossibleSlotsMessage(result);
  }

  if (result.status === 'ERROR') {
    return [
      '🔴 <b>Ошибка при проверке страницы</b>',
      '',
      `Проверено: <code>${escapeHtml(checkedAt)}</code>`,
      `HTTP: <code>${httpStatus}</code>`,
      result.errorMessage ? `Ошибка: <code>${escapeHtml(result.errorMessage)}</code>` : undefined,
      '',
      `Страница: ${escapeHtml(result.url)}`,
    ].filter(Boolean).join('\n');
  }

  return formatUnknownMessage(result);
}

export function formatPossibleSlotsMessage(result: QueueCheckResult): string {
  const checkedAt = result.checkedAt.toISOString();
  const positive = result.matchedPositivePhrases.length
    ? result.matchedPositivePhrases.join(', ')
    : 'форма/страница изменилась';

  return [
    '🟢 <b>Возможно появились места в Кишинёве</b>',
    '',
    `Сайт больше не выглядит как «все места заняты».`,
    `Проверено: <code>${escapeHtml(checkedAt)}</code>`,
    `HTTP: <code>${result.httpStatus ?? 'unknown'}</code>`,
    `Найдено: <code>${escapeHtml(positive)}</code>`,
    '',
    `Открыть страницу: ${escapeHtml(result.url)}`,
    '',
    'Проверь вручную как можно быстрее: слот может исчезнуть за несколько минут.',
  ].join('\n');
}

export function formatUnknownMessage(result: QueueCheckResult): string {
  return [
    '🟡 <b>Не удалось уверенно определить статус очереди</b>',
    '',
    `Проверено: <code>${escapeHtml(result.checkedAt.toISOString())}</code>`,
    `HTTP: <code>${result.httpStatus ?? 'unknown'}</code>`,
    `URL: ${escapeHtml(result.url)}`,
    '',
    'Страница изменилась или сайт отдал нестандартный ответ. Лучше открыть вручную.',
  ].join('\n');
}

export function formatStartupMessage(config: AppConfig, subscriberCount: number): string {
  return [
    '🤖 <b>Мониторинг электронной очереди запущен</b>',
    '',
    `URL: ${escapeHtml(config.checkUrl)}`,
    `Интервал: <code>${config.checkIntervalMinutes} мин.</code>`,
    `Cooldown уведомлений: <code>${config.alertCooldownMinutes} мин.</code>`,
    `Подписчиков: <code>${subscriberCount}</code>`,
    '',
    'Нажмите кнопку ниже, чтобы проверить текущий статус вручную.',
  ].join('\n');
}
