import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Commit, IntegrationHistory } from '../../shared/types';
import { RelationPanel } from './RelationPanel';
import { Field } from './Field';

const exampleCommit = (id: string, subject: string, parents: string[] = []): Commit => ({
  hash: id.repeat(40),
  shortHash: id.repeat(7),
  subject,
  parents: parents.map((p) => p.repeat(40)),
  author: 'MeGit',
  date: '2026-11-19T09:00:00+08:00',
  refs: '',
});
const source = exampleCommit('2', 'Add public search', ['1']);
const merged = exampleCommit('4', 'Merge public search', ['3', '2']);
const sourceUpdate = exampleCommit('5', 'Improve public search', ['2']);
const targetUpdate = exampleCommit('6', 'Server access controls', ['4']);
export function RelationPanelExample() {
  const { t } = useTranslation();
  const [integrated, setIntegrated] = useState(false);
  const history: IntegrationHistory = {
    comparison: {
      state: integrated ? 'integrated' : 'pending',
      sourceHead: integrated ? source.hash : sourceUpdate.hash,
      targetHead: targetUpdate.hash,
      pending: integrated ? 0 : 1,
      message: '',
      messageCode: integrated ? 'included' : 'pending',
    },
    sourceTip: integrated ? source : sourceUpdate,
    targetTip: targetUpdate,
    includedAt: integrated ? merged : null,
    commonBases: [source],
    shallow: false,
    sourceOnly: {
      commits: integrated ? [] : [sourceUpdate],
      total: integrated ? 0 : 1,
      hasMore: false,
    },
    targetOnly: {
      commits: [targetUpdate, merged],
      total: 2,
      hasMore: false,
    },
  };
  return (
    <section className="design-card relation-panel-example">
      <h2>{t('relation.panelExample')}</h2>
      <Field label={t('relation.heading')}>
        <select
          value={String(integrated)}
          onChange={(event) => setIntegrated(event.target.value === 'true')}
        >
          <option value="false">{t('relation.pending', { count: 1 })}</option>
          <option value="true">{t('relation.integrated')}</option>
        </select>
      </Field>
      <RelationPanel
        edge={{
          id: 'example',
          source: 'source',
          target: 'target',
          kind: 'integration',
          label: '',
          sourceRef: 'refs/heads/main',
          targetRef: 'refs/heads/main',
        }}
        source={{ id: 'example-source', name: 'MeWiki', path: '' }}
        target={{ id: 'example-target', name: 'MeWiki-Server', path: '' }}
        sampleHistory={history}
        result={history.comparison}
        onClose={() => setIntegrated(false)}
      />
    </section>
  );
}
