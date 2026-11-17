import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleHelp,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  GraduationCap,
  Layers,
  Pause,
  Play,
  RotateCcw,
  Undo2,
  Cloud,
  CircleAlert,
} from 'lucide-react';
import { Dialog } from './Dialogs';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { Tooltip } from './Tooltip';
import { GitLearningScene } from './GitLearningScene';
import { gitLessons, learningLessonIds, type LearningLessonId } from '../lib/git-learning';
import './git-learning.css';

const courseIcons = {
  basics: Layers,
  snapshots: GitCommitHorizontal,
  branches: GitBranch,
  merge: GitMerge,
  remote: Cloud,
  undo: Undo2,
  conflicts: CircleAlert,
};

export function GitLearningDialog({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const [lessonId, setLessonId] = useState<LearningLessonId>('basics');
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const lesson = gitLessons[lessonId];
  const step = lesson.steps[stepIndex];
  const lastStep = lesson.steps.length - 1;
  const number = new Intl.NumberFormat(i18n.resolvedLanguage);
  const caption = t(`learning.captions.${step.caption}`);
  const go = (next: number) => {
    setPlaying(false);
    setStepIndex(Math.max(0, Math.min(lastStep, next)));
  };

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      const next = Math.min(lastStep, stepIndex + 1);
      setStepIndex(next);
      if (next === lastStep) setPlaying(false);
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [playing, stepIndex, lastStep, lessonId]);
  useEffect(() => {
    const pause = () => setPlaying(false);
    const hide = () => {
      if (document.hidden) pause();
    };
    window.addEventListener('blur', pause);
    document.addEventListener('visibilitychange', hide);
    return () => {
      window.removeEventListener('blur', pause);
      document.removeEventListener('visibilitychange', hide);
    };
  }, []);

  return (
    <Dialog
      title={t('learning.title')}
      closeLabel={t('learning.close')}
      className="git-learning-dialog"
      draggable
      persistent
      onClose={onClose}
      headerActions={
        <span className="learning-simulation">
          <GraduationCap size={16} />
          {t('learning.simulation')}
        </span>
      }
    >
      <div
        className="learning-layout"
        data-lesson={lessonId}
        data-step={stepIndex}
        data-playing={playing}
      >
        <nav className="learning-courses" aria-label={t('learning.courses')}>
          {learningLessonIds.map((id, index) => {
            const Icon = courseIcons[id];
            return (
              <button
                key={id}
                type="button"
                className={`learning-course ${id === lessonId ? 'is-active' : ''}`}
                aria-current={id === lessonId ? 'page' : undefined}
                data-dialog-initial-focus={index === 0 ? 'true' : undefined}
                onClick={() => {
                  setPlaying(false);
                  setStepIndex(0);
                  setLessonId(id);
                }}
              >
                <span className="learning-course-number">
                  {number.format(index + 1).padStart(2, '0')}
                </span>
                <Icon size={19} />
                <span>{t(`learning.lessons.${id}.title`)}</span>
              </button>
            );
          })}
        </nav>
        <div className="learning-main">
          <header className="learning-lesson-header">
            <div>
              <h3>{t(`learning.lessons.${lessonId}.title`)}</h3>
              <p>{t(`learning.lessons.${lessonId}.hint`)}</p>
              <span className="learning-mobile-simulation">{t('learning.simulation')}</span>
            </div>
            <span className="learning-step-count">
              {t('learning.step', {
                current: number.format(stepIndex + 1),
                total: number.format(lesson.steps.length),
              })}
            </span>
          </header>
          <div className="learning-command">
            <code>{step.command || t(`learning.actions.${step.action}`)}</code>
            <Tooltip content={t('learning.commandHint')} placement="bottom">
              <button className="icon-button small" aria-label={t('learning.commandHint')}>
                <CircleHelp size={15} />
              </button>
            </Tooltip>
          </div>
          <GitLearningScene key={lessonId} lesson={lesson} step={step} />
          <footer className="learning-footer">
            <p
              className={`learning-caption ${step.caption === 'discard' ? 'is-warning' : ''}`}
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {caption}
            </p>
            <div className="learning-progress" aria-label={t('learning.progress')} role="group">
              {lesson.steps.map((item, index) => (
                <button
                  key={index}
                  className={
                    index === stepIndex ? 'is-current' : index < stepIndex ? 'is-complete' : ''
                  }
                  aria-label={t('learning.jump', {
                    number: number.format(index + 1),
                    caption: t(`learning.captions.${item.caption}`),
                  })}
                  aria-current={index === stepIndex ? 'step' : undefined}
                  onClick={() => go(index)}
                >
                  <span />
                </button>
              ))}
            </div>
            <div className="learning-controls">
              <IconButton label={t('learning.replay')} onClick={() => go(0)}>
                <RotateCcw size={17} />
              </IconButton>
              <Button
                size="compact"
                disabled={stepIndex === 0}
                icon={<ArrowLeft size={16} />}
                onClick={() => go(stepIndex - 1)}
              >
                {t('learning.previous')}
              </Button>
              <Button
                size="compact"
                icon={playing ? <Pause size={16} /> : <Play size={16} />}
                onClick={() => {
                  if (stepIndex === lastStep) setStepIndex(0);
                  setPlaying(!playing);
                }}
              >
                {t(playing ? 'learning.pause' : 'learning.play')}
              </Button>
              <Button
                className="learning-next"
                size="compact"
                variant="primary"
                disabled={stepIndex === lastStep}
                icon={stepIndex === lastStep ? <Check size={16} /> : <ArrowRight size={16} />}
                onClick={() => go(stepIndex + 1)}
              >
                {stepIndex === lastStep
                  ? t('learning.complete')
                  : t(`learning.actions.${lesson.steps[stepIndex + 1].action}`)}
              </Button>
            </div>
          </footer>
        </div>
      </div>
    </Dialog>
  );
}
