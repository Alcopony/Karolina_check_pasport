import type { QueueCheckResult } from './types.js';

export function logResult(result: QueueCheckResult, includeSnippet = false): void {
  const parts = [
    `[${result.checkedAt.toISOString()}]`,
    `status=${result.status}`,
    result.httpStatus ? `http=${result.httpStatus}` : undefined,
    result.matchedNegativePhrases.length
      ? `negative="${result.matchedNegativePhrases.join(', ')}"`
      : undefined,
    result.matchedPositivePhrases.length
      ? `positive="${result.matchedPositivePhrases.join(', ')}"`
      : undefined,
    result.errorMessage ? `error="${result.errorMessage}"` : undefined,
  ].filter(Boolean);

  console.log(parts.join(' '));

  if (includeSnippet && result.textSnippet) {
    console.log(`snippet=${result.textSnippet}`);
  }
}
