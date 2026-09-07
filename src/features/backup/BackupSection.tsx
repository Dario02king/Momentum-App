import { useRef, useState } from 'react';
import type { BackupSummary } from '../../core/backup/format';
import { Button, Card, Row, Section, Sheet } from '../../components';
import { ArchiveIcon, PlusIcon } from '../../components/Icons';
import { formatDayAndMonth } from '../../i18n/format';
import { useI18n, useT } from '../../i18n/I18nProvider';
import type { TranslationKey } from '../../i18n';
import { exportBackupFile, importBackup, inspectBackup } from '../../storage/services/backupService';
import './backup.css';

/**
 * Backup and restore, living inside Areas rather than becoming a fifth
 * destination — it is something a user does twice a year, not a part of the
 * product they navigate to.
 *
 * The copy never mentions how any of it is stored. What the user needs to
 * know is that the file holds their Momentum data from this device, and that
 * restoring one replaces what is here.
 */
export function BackupSection({ onRestored }: { onRestored(): void }) {
  const t = useT();
  const { language } = useI18n();
  const fileInput = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [pending, setPending] = useState<{ text: string; summary: BackupSummary } | null>(null);

  const download = async () => {
    try {
      const file = await exportBackupFile();
      const url = URL.createObjectURL(new Blob([file.contents], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = file.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Revoking immediately can cancel the download in some browsers.
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setStatus({
        tone: 'ok',
        text: t('backup.exported', {
          answers: file.summary.answers,
          sessions: file.summary.sessions,
        }),
      });
    } catch {
      setStatus({ tone: 'error', text: t('backup.failedRead') });
    }
  };

  const problemKey = (problem: string): TranslationKey => {
    if (problem === 'notJson') return 'backup.failedRead';
    if (problem === 'notABackup') return 'backup.failedInvalid';
    if (problem === 'newerFormat' || problem === 'newerSchema') return 'backup.failedNewer';
    return 'backup.failedBroken';
  };

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setStatus(null);
    const text = await file.text().catch(() => null);
    if (text === null) {
      setStatus({ tone: 'error', text: t('backup.failedRead') });
      return;
    }
    // Checked in full before anything is replaced, so the confirmation the
    // user sees is about a file already known to be sound.
    const result = inspectBackup(text);
    if (!result.ok) {
      setStatus({ tone: 'error', text: t(problemKey(result.problem)) });
      return;
    }
    setPending({ text, summary: result.summary });
  };

  const replace = async () => {
    if (!pending) return;
    const result = await importBackup(pending.text);
    setPending(null);
    if (result.ok) {
      setStatus({ tone: 'ok', text: t('backup.imported') });
      onRestored();
    } else {
      setStatus({ tone: 'error', text: t('backup.failedBroken') });
    }
  };

  return (
    <Section label={t('backup.title')}>
      <Card>
        <p className="backup__explain">{t('backup.explain')}</p>
        <Row
          title={t('backup.export')}
          subtitle={t('backup.exportHint')}
          leading={<ArchiveIcon size={20} />}
          onClick={() => void download()}
        />
        <Row
          title={t('backup.import')}
          subtitle={t('backup.importHint')}
          leading={<PlusIcon size={20} />}
          onClick={() => fileInput.current?.click()}
        />
        {status ? (
          <p className={`backup__status backup__status--${status.tone}`} role="status">
            {status.text}
          </p>
        ) : null}
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="visually-hidden"
          onChange={(event) => {
            void choose(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </Card>

      <Sheet
        open={pending !== null}
        title={t('backup.confirmTitle')}
        onClose={() => setPending(null)}
        footer={
          <>
            <Button variant="destructive" block onClick={() => void replace()}>
              {t('backup.confirmAction')}
            </Button>
            <Button variant="quiet" block onClick={() => setPending(null)}>
              {t('common.cancel')}
            </Button>
          </>
        }
      >
        <p className="backup__confirmBody">{t('backup.confirmBody')}</p>
        {pending ? (
          <div className="backup__confirmDetail">
            <p>
              {t('backup.confirmDetail', {
                answers: pending.summary.answers,
                sessions: pending.summary.sessions,
              })}
            </p>
            {pending.summary.firstDay && pending.summary.lastDay ? (
              <p className="backup__confirmRange">
                {t('backup.confirmRange', {
                  from: formatDayAndMonth(language, pending.summary.firstDay),
                  to: formatDayAndMonth(language, pending.summary.lastDay),
                })}
              </p>
            ) : null}
          </div>
        ) : null}
      </Sheet>
    </Section>
  );
}
