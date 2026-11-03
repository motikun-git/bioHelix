import { useState } from 'react';
import { get } from '../../lib/api.js';
import { formatDate } from '../../lib/format.js';
import { Alert, Button, Loading, PageHeader, Panel, useLoad } from '../../components/ui.jsx';

const LABELS = {
  students: 'Students',
  results: 'Exam results',
  exams: 'Exams',
  attendances: 'Attendance days',
  payments: 'Payments',
  batches: 'Batches',
  notices: 'Notices',
  events: 'Calendar events',
  admins: 'Admins',
};

export function daysSince(date) {
  if (!date) return null;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
}

export default function Backup() {
  const info = useLoad(() => get('/backup/info'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const download = async () => {
    setBusy(true);
    setError('');
    setDone('');
    try {
      const res = await fetch('/api/backup/download', { credentials: 'same-origin' });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message || 'Backup failed');
      const name = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] || 'biohelix-backup.json';
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
      setDone(`Saved ${name}. Keep it somewhere safe, like Google Drive.`);
      info.reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-5">
      <PageHeader title="Backup" subtitle="Download a copy of everything: students, results, attendance, fees, notices." />
      <Panel>
        <Loading state={info}>
          {({ last }) => {
            const age = daysSince(last?.at);
            return (
              <div className="space-y-4">
                {last ? (
                  <div>
                    <p className={age > 7 ? 'text-lg font-semibold text-fail' : 'text-lg font-semibold'}>
                      Last backup {age === 0 ? 'today' : age === 1 ? 'yesterday' : `${age} days ago`} ({formatDate(last.at)})
                    </p>
                    <p className="text-sm text-ink-soft">
                      {Object.entries(last.counts)
                        .filter(([k]) => LABELS[k])
                        .map(([k, v]) => `${LABELS[k]} ${v}`)
                        .join(', ')}
                    </p>
                  </div>
                ) : (
                  <p className="text-lg font-semibold text-fail">No backup has been taken yet.</p>
                )}
                <Button onClick={download} loading={busy}>
                  Download backup
                </Button>
                <Alert>{error}</Alert>
                {done && <Alert tone="success">{done}</Alert>}
              </div>
            );
          }}
        </Loading>
      </Panel>
      <Panel title="Keep backups safe">
        <ul className="list-disc space-y-2 pl-5 text-ink-soft">
          <li>Take a backup at least once a week, and before any big change (new session, deleting a batch).</li>
          <li>The file has every student&apos;s phone numbers and login data. Keep it in a private place (your own Google Drive), never in a public group or GitHub.</li>
          <li>To bring a backup back, the developer runs the restore command described in the README. Current data is saved automatically before a restore.</li>
        </ul>
      </Panel>
    </div>
  );
}
