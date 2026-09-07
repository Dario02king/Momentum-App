import { nowIso } from '../../core/clock';
import type { DateKey } from '../../core/dates';
import { answerId, type AnswerRecord, type AnswerValue, type QuestionType } from '../../core/model';
import { STORES } from '../db';
import { createRepository } from './base';

const repo = createRepository<AnswerRecord>(STORES.answers);

export interface AnswerInput {
  date: DateKey;
  questionId: string;
  domainId: string;
  value: AnswerValue;
  valueType: QuestionType;
  configSnapshotId: string;
}

export const answersRepository = {
  async get(date: DateKey, questionId: string): Promise<AnswerRecord | undefined> {
    return repo.get(answerId(date, questionId));
  },

  async listByDate(date: DateKey): Promise<AnswerRecord[]> {
    return repo.queryIndex('by_date', date);
  },

  /** Inclusive on both ends; the driver of every history view. */
  async listByDateRange(from: DateKey, to: DateKey): Promise<AnswerRecord[]> {
    if (to < from) return [];
    return repo.queryIndex('by_date', IDBKeyRange.bound(from, to));
  },

  async listByQuestion(questionId: string): Promise<AnswerRecord[]> {
    return repo.queryIndex('by_question', questionId);
  },

  /**
   * Writes the answer for one question on one day. The composite id means a
   * second answer for the same day replaces the first rather than stacking:
   * a question is asked once per calendar day, and correcting it is an edit.
   */
  async save(input: AnswerInput): Promise<AnswerRecord> {
    const id = answerId(input.date, input.questionId);
    const existing = await repo.get(id);
    const stamp = nowIso();
    const record: AnswerRecord = {
      id,
      date: input.date,
      questionId: input.questionId,
      domainId: input.domainId,
      value: input.value,
      valueType: input.valueType,
      // Wellbeing is one of the two domains a later social layer defaults to
      // private (D47). Nothing reads this yet.
      sensitivity: existing?.sensitivity ?? 'private',
      configSnapshotId: existing?.configSnapshotId ?? input.configSnapshotId,
      createdAt: existing?.createdAt ?? stamp,
      updatedAt: stamp,
    };
    await repo.put(record);
    return record;
  },

  /** Clearing an answer returns the day to "unanswered", not to "not done". */
  async clear(date: DateKey, questionId: string): Promise<void> {
    await repo.remove(answerId(date, questionId));
  },

  async getAll(): Promise<AnswerRecord[]> {
    return repo.getAll();
  },

  async replaceAll(records: AnswerRecord[]): Promise<void> {
    await repo.clear();
    await repo.putMany(records);
  },
};
