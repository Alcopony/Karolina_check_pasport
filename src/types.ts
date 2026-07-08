export type QueueStatus = 'NO_SLOTS' | 'POSSIBLE_SLOTS' | 'UNKNOWN' | 'ERROR';

export interface QueueCheckResult {
  status: QueueStatus;
  checkedAt: Date;
  url: string;
  httpStatus?: number;
  matchedNegativePhrases: string[];
  matchedPositivePhrases: string[];
  title?: string;
  errorMessage?: string;
  textSnippet?: string;
}
