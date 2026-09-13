import type { TrainingPlanRecord } from '../../core/model';
import { Button, Row, Sheet } from '../../components';
import { ChevronRightIcon } from '../../components/Icons';
import { useT } from '../../i18n/I18nProvider';
import './gym.css';

/**
 * What to train today.
 *
 * Saved plans first, because a plan is the whole point: one tap and every
 * exercise is on the page. The free session stays underneath, unchanged,
 * for a day that does not follow a plan. Choosing a plan writes nothing —
 * the session comes into being with the first saved set.
 */
export function PlanChooserSheet({
  open,
  plans,
  onClose,
  onChoosePlan,
  onFreeSession,
  onManagePlans,
}: {
  open: boolean;
  plans: TrainingPlanRecord[];
  onClose(): void;
  onChoosePlan(plan: TrainingPlanRecord): void;
  onFreeSession(): void;
  onManagePlans(): void;
}) {
  const t = useT();
  return (
    <Sheet
      open={open}
      title={t('plans.chooser.title')}
      onClose={onClose}
      footer={
        <Button variant="secondary" block onClick={onFreeSession}>
          {t('plans.chooser.free')}
        </Button>
      }
    >
      <div className="plan-chooser">
        <h3 className="plan-chooser__heading">{t('plans.chooser.plans')}</h3>
        {plans.map((plan) => (
          <Row
            key={plan.id}
            title={plan.name}
            subtitle={
              plan.exercises.length === 1
                ? t('plans.countOne')
                : t('plans.count', { count: plan.exercises.length })
            }
            onClick={() => onChoosePlan(plan)}
            trailing={<ChevronRightIcon size={18} />}
          />
        ))}
        <button type="button" className="plan-chooser__manage" onClick={onManagePlans}>
          {t('plans.chooser.manage')}
        </button>
        <p className="plan-chooser__freeHint">{t('plans.chooser.freeHint')}</p>
      </div>
    </Sheet>
  );
}
