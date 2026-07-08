import * as cheerio from 'cheerio';
import type { QueueCheckResult, QueueStatus } from './types.js';

const NEGATIVE_PHRASES = [
  'наразі всі місця зайняті',
  'всі місця зайняті',
  'усі місця зайняті',
  'відсутні місця',
  'немає вільних місць',
  'нет свободных мест',
  'все места заняты',
  'спробуйте в інший час або день',
  'попробуйте в другое время или день',
];

const POSITIVE_PHRASES = [
  'послуга',
  'обрати день',
  'обрати час',
  'номер телефону',
  'запис в електронну чергу',
  'електронна черга',
  'підтверджую згоду',
  'відправити',
];

function normalizeText(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function findPhrases(text: string, phrases: string[]): string[] {
  return phrases.filter((phrase) => text.includes(phrase));
}

function getTextSnippet(text: string, maxLength = 700): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…`;
}

function decideStatus(negativeMatches: string[], positiveMatches: string[]): QueueStatus {
  if (negativeMatches.length > 0) return 'NO_SLOTS';

  const hasStrongFormSignal =
    positiveMatches.includes('обрати день') &&
    positiveMatches.includes('обрати час') &&
    positiveMatches.includes('номер телефону');

  if (hasStrongFormSignal) return 'POSSIBLE_SLOTS';

  return 'UNKNOWN';
}

export function detectQueueStatus(html: string, url: string, httpStatus?: number): QueueCheckResult {
  const $ = cheerio.load(html);

  $('script, style, noscript, svg').remove();

  const title = normalizeText($('title').first().text());
  const visibleText = normalizeText($.root().text());
  const negativeMatches = findPhrases(visibleText, NEGATIVE_PHRASES);
  const positiveMatches = findPhrases(visibleText, POSITIVE_PHRASES);

  return {
    status: decideStatus(negativeMatches, positiveMatches),
    checkedAt: new Date(),
    url,
    httpStatus,
    matchedNegativePhrases: negativeMatches,
    matchedPositivePhrases: positiveMatches,
    title: title || undefined,
    textSnippet: getTextSnippet(visibleText),
  };
}
