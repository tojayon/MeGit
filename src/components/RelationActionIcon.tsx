import { Download, GitMerge, Upload } from 'lucide-react';
import type { RelationAction } from '../../shared/types';

const actionIcons = { pull: Download, push: Upload, integrate: GitMerge };

export function RelationActionIcon({ action, size }: { action: RelationAction['type']; size: number }) {
  const Icon = actionIcons[action];
  return <Icon size={size} aria-hidden="true" />;
}
