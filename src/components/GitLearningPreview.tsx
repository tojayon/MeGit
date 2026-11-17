import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GitLearningScene } from './GitLearningScene';
import {
  getGitLearningDemo,
  type GitLearningDemoId,
  type GitLearningPlayback,
} from '../lib/git-learning-media';
import './git-learning.css';
import './git-learning-preview.css';

export type GitLearningPreviewProps = {
  demo: GitLearningDemoId;
  playback?: GitLearningPlayback;
  poster?: 'before' | 'after';
  active?: boolean;
};

function PreviewPlayback({
  demo,
  playback = 'animated',
  poster = 'after',
  active = true,
}: GitLearningPreviewProps) {
  const { t } = useTranslation();
  const source = useMemo(() => getGitLearningDemo(demo), [demo]);
  const [cursor, setCursor] = useState(0);
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [paused, setPaused] = useState(false);
  const last = source.steps.length - 1;
  const still = playback === 'still' || reduced || !active;
  const index = still ? (poster === 'before' ? 0 : last) : cursor;
  const playing = !still && !paused && cursor < last;
  const step = source.steps[index];

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    const pause = () => setPaused(true);
    const hide = () => {
      if (document.hidden) pause();
    };
    query.addEventListener('change', update);
    window.addEventListener('blur', pause);
    document.addEventListener('visibilitychange', hide);
    return () => {
      query.removeEventListener('change', update);
      window.removeEventListener('blur', pause);
      document.removeEventListener('visibilitychange', hide);
    };
  }, []);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(
      () => setCursor((current) => Math.min(last, current + 1)),
      1400,
    );
    return () => window.clearTimeout(timer);
  }, [playing, cursor, last]);

  return (
    <span
      className="git-learning-preview"
      data-learning-demo={demo}
      data-frame={step.caption}
      data-playing={playing}
      data-mode={still ? 'still' : 'animated'}
    >
      <GitLearningScene lesson={source.lesson} step={step} presentation="preview" />
      <span className="git-learning-preview-caption">{t(`learning.captions.${step.caption}`)}</span>
    </span>
  );
}

/** A finite, read-only scene; unmount or set active=false to stop background work. */
export function GitLearningPreview(props: GitLearningPreviewProps) {
  return (
    <PreviewPlayback
      key={`${props.demo}:${props.playback ?? 'animated'}:${props.poster ?? 'after'}`}
      {...props}
    />
  );
}
