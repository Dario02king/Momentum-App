import { nowIso } from '../../core/clock';
import { createId } from '../../core/ids';
import type { QuestionRecord, QuestionStatus, QuestionType } from '../../core/model';
import { STORES } from '../db';
import { createRepository } from './base';

const repo = createRepository<QuestionRecord>(STORES.questions);

function byOrder(a: QuestionRecord, b: QuestionRecord): number {
  return a.order - b.order || a.createdAt.localeCompare(b.createdAt);
}

export interface NewQuestionInput {
  domainId: string;
  text: string;
  /** Boolean is the default: most things were either done or not. */
  type?: QuestionType;
  order?: number;
}

export const questionsRepository = {
  async get(id: string): Promise<QuestionRecord | undefined> {
    return repo.get(id);
  },

  async list(): Promise<QuestionRecord[]> {
    return (await repo.getAll()).sort(byOrder);
  },

  async listByDomain(domainId: string): Promise<QuestionRecord[]> {
    return (await repo.queryIndex('by_domain', domainId)).sort(byOrder);
  },

  /** Questions that are actually asked. Paused and archived ones are not. */
  async listActive(): Promise<QuestionRecord[]> {
    return (await repo.queryIndex('by_status', 'active' satisfies QuestionStatus)).sort(byOrder);
  },

  async create(input: NewQuestionInput): Promise<QuestionRecord> {
    const stamp = nowIso();
    const siblings = await questionsRepository.listByDomain(input.domainId);
    const record: QuestionRecord = {
      id: createId('q'),
      domainId: input.domainId,
      text: input.text.trim(),
      type: input.type ?? 'boolean',
      status: 'active',
      order: input.order ?? siblings.length,
      createdAt: stamp,
      updatedAt: stamp,
      archivedAt: null,
    };
    await repo.put(record);
    return record;
  },

  async update(
    id: string,
    patch: Partial<Pick<QuestionRecord, 'text' | 'type' | 'order' | 'status'>>,
  ): Promise<QuestionRecord | undefined> {
    const current = await repo.get(id);
    if (!current) return undefined;
    const next: QuestionRecord = { ...current, ...patch, updatedAt: nowIso() };
    await repo.put(next);
    return next;
  },

  async setStatus(id: string, status: QuestionStatus): Promise<QuestionRecord | undefined> {
    const current = await repo.get(id);
    if (!current) return undefined;
    const stamp = nowIso();
    const next: QuestionRecord = {
      ...current,
      status,
      archivedAt: status === 'archived' ? (current.archivedAt ?? stamp) : null,
      updatedAt: stamp,
    };
    await repo.put(next);
    return next;
  },

  /**
   * Archiving hides a question from Areas and stops it being asked. It never
   * removes answers: history stays intact and keeps counting for past days.
   */
  async archive(id: string): Promise<QuestionRecord | undefined> {
    return questionsRepository.setStatus(id, 'archived');
  },

  async replaceAll(records: QuestionRecord[]): Promise<void> {
    await repo.clear();
    await repo.putMany(records);
  },
};
