import { Download, GitCompareArrows, GitMerge, Upload } from 'lucide-react';
import type { RelationShortcut } from '../lib/relation-actions';

const actionIcons = { pull: Download, push: Upload, integrate: GitMerge, merge: GitCompareArrows };

export function RelationActionIcon({ action, size }: { action: RelationShortcut['type']; size: number }) {
  const Icon = actionIcons[action];
  return <Icon size={size} aria-hidden="true" />;
}
