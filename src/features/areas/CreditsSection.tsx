import { useState } from 'react';
import { Card, Row, Section, Sheet } from '../../components';
import { ChevronRightIcon } from '../../components/Icons';
import { useT } from '../../i18n/I18nProvider';

const MODEL_URL =
  'https://sketchfab.com/3d-models/muscular-athletic-body-male-base-mesh-a58450cb3c23429f8f7acb2c7b22b552';
const LICENCE_URL = 'http://creativecommons.org/licenses/by/4.0/';

/**
 * Credits, in Settings.
 *
 * The body model is licensed CC BY 4.0, which asks that the author, the
 * source, the licence and the fact that the work was modified stay with it
 * and stay reachable by the reader. That belongs on a page somebody can
 * open, not under the body itself: a permanent legal block beneath a picture
 * of your muscles is neither respectful of the licence nor of the screen.
 */
export function CreditsSection() {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <Section label={t('areas.credits')}>
      <Card>
        <Row
          title={t('areas.credits.body')}
          subtitle={t('areas.credits.bodySubtitle')}
          trailing={<ChevronRightIcon size={18} />}
          onClick={() => setOpen(true)}
        />
      </Card>

      <Sheet open={open} title={t('areas.credits')} onClose={() => setOpen(false)}>
        <div className="metric-sheet__body">
          <p>{t('gym.body.credit')}</p>
          <p className="credits__links">
            <a href={MODEL_URL} target="_blank" rel="noopener noreferrer">
              {t('gym.body.credit.model')}
            </a>
            <a href={LICENCE_URL} target="_blank" rel="noopener noreferrer">
              {t('gym.body.credit.license')}
            </a>
          </p>
          <p className="metric-sheet__note">{t('areas.credits.modified')}</p>
        </div>
      </Sheet>
    </Section>
  );
}
