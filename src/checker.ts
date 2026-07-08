import { detectQueueStatus } from './queueDetector.js';
import type { AppConfig } from './config.js';
import type { QueueCheckResult } from './types.js';

export async function checkQueue(config: AppConfig): Promise<QueueCheckResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.checkTimeoutMs);

  try {
    const response = await fetch(config.checkUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': config.userAgent,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'uk-UA,uk;q=0.9,ru;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    });

    const html = await response.text();
    const result = detectQueueStatus(html, config.checkUrl, response.status);

    if (!response.ok) {
      return {
        ...result,
        status: 'ERROR',
        errorMessage: `HTTP ${response.status} ${response.statusText}`,
      };
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isAbort = error instanceof Error && error.name === 'AbortError';

    return {
      status: 'ERROR',
      checkedAt: new Date(),
      url: config.checkUrl,
      matchedNegativePhrases: [],
      matchedPositivePhrases: [],
      errorMessage: isAbort ? `Request timeout after ${config.checkTimeoutMs} ms` : errorMessage,
    };
  } finally {
    clearTimeout(timeout);
  }
}
