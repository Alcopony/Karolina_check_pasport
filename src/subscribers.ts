import { dirname } from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';

export type Subscriber = {
  chatId: number;
  type?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  addedAt: string;
  lastSeenAt: string;
};

type SubscriberFile = {
  subscribers: Subscriber[];
  telegramUpdateOffset?: number;
};

export class SubscriberStore {
  private data: SubscriberFile = { subscribers: [] };
  private loaded = false;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async load(): Promise<void> {
    if (this.loaded) return;

    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<SubscriberFile>;
      this.data = {
        subscribers: Array.isArray(parsed.subscribers) ? parsed.subscribers : [],
        telegramUpdateOffset:
          typeof parsed.telegramUpdateOffset === 'number' ? parsed.telegramUpdateOffset : undefined,
      };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== 'ENOENT') throw error;
      this.data = { subscribers: [] };
      await this.save();
    }

    this.loaded = true;
  }

  getAll(): Subscriber[] {
    return [...this.data.subscribers];
  }

  count(): number {
    return this.data.subscribers.length;
  }

  getUpdateOffset(): number | undefined {
    return this.data.telegramUpdateOffset;
  }

  async setUpdateOffset(offset: number): Promise<void> {
    this.data.telegramUpdateOffset = offset;
    await this.save();
  }

  async addOrUpdate(input: Omit<Subscriber, 'addedAt' | 'lastSeenAt'>): Promise<boolean> {
    const now = new Date().toISOString();
    const existing = this.data.subscribers.find((subscriber) => subscriber.chatId === input.chatId);

    if (existing) {
      existing.type = input.type;
      existing.username = input.username;
      existing.firstName = input.firstName;
      existing.lastName = input.lastName;
      existing.lastSeenAt = now;
      await this.save();
      return false;
    }

    this.data.subscribers.push({
      ...input,
      addedAt: now,
      lastSeenAt: now,
    });
    await this.save();
    return true;
  }

  async remove(chatId: number): Promise<boolean> {
    const before = this.data.subscribers.length;
    this.data.subscribers = this.data.subscribers.filter((subscriber) => subscriber.chatId !== chatId);
    const removed = this.data.subscribers.length !== before;

    if (removed) await this.save();
    return removed;
  }

  private async save(): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      await mkdir(dirname(this.filePath), { recursive: true });
      const tempPath = `${this.filePath}.tmp`;
      await writeFile(tempPath, JSON.stringify(this.data, null, 2), 'utf8');
      await rename(tempPath, this.filePath);
    });

    await this.writeQueue;
  }
}
