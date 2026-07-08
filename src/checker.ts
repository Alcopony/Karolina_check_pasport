import { detectQueueStatus } from './queueDetector.js';
import type { AppConfig } from './config.js';
import type { QueueCheckResult } from './types.js';

type CookieMap = Map<string, string>;

function appendCookies(cookieMap: CookieMap, setCookieHeaders: string[]): void {
  for (const header of setCookieHeaders) {
    const firstPart = header.split(';')[0]?.trim();
    if (!firstPart || !firstPart.includes('=')) continue;
    const equalIndex = firstPart.indexOf('=');
    const name = firstPart.slice(0, equalIndex).trim();
    const value = firstPart.slice(equalIndex + 1).trim();
    if (name) cookieMap.set(name, value);
  }
}

function cookieHeader(cookieMap: CookieMap): string {
  return [...cookieMap.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

function getSetCookieHeaders(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();

  const single = response.headers.get('set-cookie');
  return single ? [single] : [];
}

function browserHeaders(config: AppConfig, referer?: string, cookies?: string): HeadersInit {
  const headers: Record<string, string> = {
    'User-Agent': config.userAgent,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': config.acceptLanguage,
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    DNT: '1',
    Connection: 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': referer ? 'same-origin' : 'none',
    'Sec-Fetch-User': '?1',
    'sec-ch-ua': '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
  };

  if (referer) headers.Referer = referer;
  if (cookies) headers.Cookie = cookies;
  return headers;
}

function originFromUrl(url: string): string {
  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.host}/`;
}

export async function checkQueue(config: AppConfig): Promise<QueueCheckResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.checkTimeoutMs);
  const cookies: CookieMap = new Map();

  try {
    const origin = originFromUrl(config.checkUrl);

    if (config.warmupRequest) {
      try {
        const warmupResponse = await fetch(origin, {
          method: 'GET',
          redirect: 'follow',
          signal: controller.signal,
          headers: browserHeaders(config),
        });
        appendCookies(cookies, getSetCookieHeaders(warmupResponse));
      } catch {
        // Warmup is best-effort. The actual queue check below still runs.
      }
    }

    const response = await fetch(config.checkUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: browserHeaders(config, origin, cookieHeader(cookies)),
    });

    appendCookies(cookies, getSetCookieHeaders(response));
    const html = await response.text();
    const result = detectQueueStatus(html, config.checkUrl, response.status);

    if (!response.ok) {
      const snippet = html.replace(/\s+/g, ' ').slice(0, 500);
      return {
        ...result,
        status: 'ERROR',
        errorMessage: `HTTP ${response.status} ${response.statusText}${snippet ? `. Body: ${snippet}` : ''}`,
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
