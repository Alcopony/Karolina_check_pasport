import type { AppConfig } from './config.js';
import type { QueueCheckResult } from './types.js';

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function sendTelegramMessage(config: AppConfig, text: string): Promise<void> {
  const endpoint = `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: config.telegramChatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: false,
    }),
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`Telegram sendMessage failed: HTTP ${response.status} ${responseText}`);
  }
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

export function formatStartupMessage(config: AppConfig): string {
  return [
    '🤖 <b>Мониторинг электронной очереди запущен</b>',
    '',
    `URL: ${escapeHtml(config.checkUrl)}`,
    `Интервал: <code>${config.checkIntervalMinutes} мин.</code>`,
    `Cooldown уведомлений: <code>${config.alertCooldownMinutes} мин.</code>`,
  ].join('\n');
}
