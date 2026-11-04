import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { del, get, post, put, upload } from '../../lib/api.js';
import { formatDate, num } from '../../lib/format.js';
import { Alert, Button, Field, Input, Loading, Modal, Panel, Select, StatusBadge, cx, useLoad } from '../../components/ui.jsx';
import { ExamForm } from './Exams.jsx';
import OnlineExam from './OnlineExam.jsx';
import QuestionAnalysis from './QuestionAnalysis.jsx';

// ---------- Import from Google Sheet or CSV ----------

function ColumnPicker({ preview, onImport, busy }) {
  const [studentId, setStudentId] = useState(preview.guess.studentId >= 0 ? preview.guess.studentId : '');
  const [score, setScore] = useState(preview.guess.score >= 0 ? preview.guess.score : '');
  const options = preview.headers.map((h, i) => (
    <option key={i} value={i}>
      {h || `Column ${i + 1}`}
    </option>
  ));
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-soft">
        Found {preview.totalRows} responses{preview.sheetRange ? ` in tab "${preview.sheetRange}"` : ''}. Check the two columns below, then import.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Which column has the Student ID?">
          <Select value={studentId} onChange={(e) => setStudentId(e.target.value)} required>
            <option value="">Choose a column</option>
            {options}
          </Select>
        </Field>
        <Field label="Which column has the score?">
          <Select value={score} onChange={(e) => setScore(e.target.value)} required>
            <option value="">Choose a column</option>
            {options}
          </Select>
        </Field>
      </div>
      {studentId !== '' && score !== '' && (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper text-ink-soft">
              <tr>
                <th className="px-3 py-2 font-semibold">Student ID</th>
                <th className="px-3 py-2 font-semibold">Score</th>
              </tr>
            </thead>
            <tbody>
              {preview.sample.map((row, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="px-3 py-2">{row[studentId]}</td>
                  <td className="px-3 py-2">{row[score]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-line px-3 py-2 text-xs text-ink-soft">First {preview.sample.length} rows</p>
        </div>
      )}
      <Button onClick={() => onImport({ studentId: Number(studentId), score: Number(score) })} loading={busy} disabled={studentId === '' || score === ''}>
        Import marks
      </Button>
    </div>
  );
}

function ImportReport({ report }) {
  if (!report?.at && report?.imported === undefined) return null;
  const problems = [
    ['Student ID not found', report.unmatched, 'Check for typos; fix the row in the sheet or type the marks by hand.'],
    ['Submitted more than once (first one kept)', report.duplicates, ''],
    ['Score could not be read', report.invalid, ''],
  ].filter(([, rows]) => rows?.length);
  return (
    <div className="space-y-3">
      <Alert tone="success">
        {report.imported} marks imported, {report.absent} marked absent{report.at ? ` (${formatDate(report.at)})` : ''}.
      </Alert>
      {problems.map(([title, rows, hint]) => (
        <div key={title} className="rounded-lg border border-draft/30 bg-draft-tint p-3 text-sm text-draft">
          <p className="font-semibold">
            {title}: {rows.length}
          </p>
          {hint && <p>{hint}</p>}
          <ul className="mt-1 list-inside list-disc">
            {rows.slice(0, 20).map((r) => (
              <li key={`${r.row}-${r.value}`}>
                Row {r.row}: {r.value || '(empty)'}
                {r.reason ? `, ${r.reason}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function SheetImport({ exam, onDone }) {
  const [source, setSource] = useState('sheet');
  const [link, setLink] = useState(exam.sheetId ? `https://docs.google.com/spreadsheets/d/${exam.sheetId}` : '');
  const [tab, setTab] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const loadPreview = () =>
    run(async () => {
      setReport(null);
      if (source === 'sheet') {
        setPreview(await post(`/exams/${exam._id}/sheet/preview`, { sheetUrl: link, sheetRange: tab || undefined }));
      } else {
        const fd = new FormData();
        fd.append('file', file);
        setPreview(await upload(`/exams/${exam._id}/csv/preview`, fd));
      }
    });

  const doImport = (columnMap) =>
    run(async () => {
      let res;
      if (source === 'sheet') res = await post(`/exams/${exam._id}/sheet/import`, { columnMap });
      else {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('studentIdColumn', columnMap.studentId);
        fd.append('scoreColumn', columnMap.score);
        res = await upload(`/exams/${exam._id}/csv/import`, fd);
      }
      setReport(res);
      setPreview(null);
      onDone();
    });

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border border-line bg-paper p-1">
        {[
          ['sheet', 'Google Sheet link'],
          ['csv', 'Upload CSV'],
        ].map(([value, label]) => (
          <button
            key={value}
            onClick={() => {
              setSource(value);
              setPreview(null);
              setError('');
            }}
            className={cx('min-h-9 rounded-md px-3 text-sm font-semibold', source === value ? 'bg-white text-ink shadow-sm' : 'text-ink-soft')}
          >
            {label}
          </button>
        ))}
      </div>

      {source === 'sheet' ? (
        <div className="space-y-3">
          <Field label="Response sheet link" hint="In the Google Form: Responses, Link to Sheets. Share that sheet with the service account as Viewer.">
            <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" />
          </Field>
          <Field label="Tab name" hint="Leave empty to use the first tab">
            <Input value={tab} onChange={(e) => setTab(e.target.value)} placeholder="Form Responses 1" />
          </Field>
        </div>
      ) : (
        <Field label="CSV file" hint="In the response sheet: File, Download, Comma-separated values">
          <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files[0] || null)} className="block w-full text-sm file:mr-3 file:min-h-10 file:rounded-lg file:border-0 file:bg-helix-tint file:px-4 file:font-semibold file:text-helix-dark" />
        </Field>
      )}

      {!preview && (
        <Button variant="secondary" onClick={loadPreview} loading={busy} disabled={source === 'sheet' ? !link : !file}>
          Read responses
        </Button>
      )}
      <Alert>{error}</Alert>
      {preview && <ColumnPicker preview={preview} onImport={doImport} busy={busy} />}
      {report && <ImportReport report={report} />}
    </div>
  );
}

// ---------- Type marks by hand ----------

function MarksGrid({ exam, onSaved }) {
  const roster = useLoad(() => get(`/exams/${exam._id}/roster`), [exam._id]);
  const [edits, setEdits] = useState({});
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const value = (row) => edits[row.student] ?? { marks: row.marks === null ? '' : String(row.marks), isAbsent: row.isAbsent };
  const change = (row, patch) => {
    setSaved(false);
    setEdits({ ...edits, [row.student]: { ...value(row), ...patch } });
  };

  const save = async () => {
    setError('');
    const entries = [];
    for (const [student, v] of Object.entries(edits)) {
      const marks = v.marks === '' ? null : Number(v.marks);
      if (marks !== null && (Number.isNaN(marks) || marks < 0 || marks > exam.totalMarks)) {
        const row = roster.data.find((r) => r.student === student);
        return setError(`${row?.name}: marks must be between 0 and ${exam.totalMarks}`);
      }
      entries.push({ student, marks: v.isAbsent ? null : marks, isAbsent: v.isAbsent });
    }
    setBusy(true);
    try {
      await put(`/exams/${exam._id}/marks`, { entries });
      setEdits({});
      setSaved(true);
      roster.reload();
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const changed = Object.keys(edits).length;

  return (
    <Loading state={roster}>
      {(rows) =>
        rows.length === 0 ? (
          <p className="text-ink-soft">No active students in these batches.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-ink-soft">Out of {exam.totalMarks}. Leave a box empty if the marks are not ready yet.</p>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {rows.map((row) => {
                const v = value(row);
                return (
                  <li key={row.student} className="flex items-center gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{row.name}</p>
                      <p className="truncate text-xs text-ink-soft">
                        {row.studentId}, {row.batch}
                      </p>
                    </div>
                    <div className="w-20 shrink-0">
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min="0"
                      max={exam.totalMarks}
                      value={v.isAbsent ? '' : v.marks}
                      disabled={v.isAbsent}
                      onChange={(e) => change(row, { marks: e.target.value })}
                      className="text-right"
                      aria-label={`Marks for ${row.name}`}
                    />
                    </div>
                    <label className="flex items-center gap-1 text-sm text-ink-soft">
                      <input type="checkbox" className="size-5 accent-fail" checked={v.isAbsent} onChange={(e) => change(row, { isAbsent: e.target.checked })} />
                      Absent
                    </label>
                  </li>
                );
              })}
            </ul>
            <Alert>{error}</Alert>
            {saved && <Alert tone="success">Marks saved.</Alert>}
            <div className="sticky bottom-20 lg:bottom-4">
              <Button onClick={save} loading={busy} disabled={!changed} className="w-full shadow-lg sm:w-auto">
                {changed ? `Save ${changed} ${changed === 1 ? 'change' : 'changes'}` : 'Save marks'}
              </Button>
            </div>
          </div>
        )
      }
    </Loading>
  );
}

// ---------- Results table ----------

function ResultsTable({ exam, version }) {
  const results = useLoad(() => get(`/exams/${exam._id}/results`), [exam._id, version]);
  return (
    <Loading state={results}>
      {(rows) =>
        rows.length === 0 ? (
          <p className="text-ink-soft">No marks yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="text-sm text-ink-soft">
                <tr className="border-b border-line">
                  <th className="py-2 pr-3 font-semibold">Rank</th>
                  <th className="py-2 pr-3 font-semibold">Student</th>
                  <th className="hidden py-2 pr-3 font-semibold sm:table-cell">Batch</th>
                  <th className="py-2 text-right font-semibold">Marks</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r._id} className="border-b border-line last:border-0">
                    <td className="py-2 pr-3 font-semibold">{exam.status === 'published' ? r.rank ?? '–' : '–'}</td>
                    <td className="py-2 pr-3">
                      <Link to={`/admin/students/${r.student?._id}`} className="font-semibold hover:text-helix-dark">
                        {r.student?.name}
                      </Link>
                      <span className="block text-xs text-ink-soft">{r.student?.studentId}</span>
                    </td>
                    <td className="hidden py-2 pr-3 text-sm sm:table-cell">{r.student?.batch}</td>
                    <td className="py-2 text-right">
                      {r.isAbsent ? (
                        <span className="font-semibold text-fail">Absent</span>
                      ) : (
                        <span className={cx('font-semibold', exam.passMarks > 0 && !r.passed && 'text-fail')}>{num(r.marks)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {exam.status !== 'published' && <p className="mt-2 text-sm text-ink-soft">Ranks are calculated when you publish.</p>}
          </div>
        )
      }
    </Loading>
  );
}

// ---------- Page ----------

export default function ExamDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const state = useLoad(() => get(`/exams/${id}`), [id]);
  const [version, setVersion] = useState(0);
  const [editing, setEditing] = useState(false);
  const [manual, setManual] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    state.reload();
    setVersion((v) => v + 1);
  };

  const act = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Loading state={state}>
      {(exam) => {
        const marksPanel = (
          <Panel
            title={exam.mode === 'google_form' ? 'Google Form marks' : 'Enter marks'}
            action={
              exam.mode === 'google_form' && (
                <button className="text-sm font-semibold text-helix-dark" onClick={() => setManual(!manual)}>
                  {manual ? 'Import from sheet' : 'Type marks instead'}
                </button>
              )
            }
          >
            {exam.mode === 'offline' || manual ? (
              <MarksGrid exam={exam} onSaved={refresh} />
            ) : (
              <>
                <SheetImport exam={exam} onDone={refresh} />
                {exam.lastImport?.at && (
                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm font-semibold text-ink-soft">Last import</summary>
                    <div className="mt-2">
                      <ImportReport report={exam.lastImport} />
                    </div>
                  </details>
                )}
              </>
            )}
          </Panel>
        );
        return (
        <div className="space-y-6">
          <Link to="/admin/exams" className="text-sm font-semibold text-helix-dark">
            All exams
          </Link>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold sm:text-3xl">{exam.title}</h1>
              <p className="text-ink-soft">
                {formatDate(exam.date)}, {exam.batches.map((b) => b.name).join(', ')}, out of {exam.totalMarks}
                {exam.passMarks > 0 && ` (pass ${exam.passMarks})`}
              </p>
              <div className="mt-2">
                <StatusBadge status={exam.status} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {exam.status === 'published' ? (
                <Button variant="secondary" loading={busy} onClick={() => act(async () => (await post(`/exams/${id}/unpublish`), refresh()))}>
                  Unpublish
                </Button>
              ) : (
                <Button
                  loading={busy}
                  disabled={!exam.stats.present}
                  onClick={() =>
                    window.confirm('Publish this result? Students will see their marks and rank.') &&
                    act(async () => {
                      try {
                        await post(`/exams/${id}/publish`);
                      } catch (err) {
                        if (err.data?.code !== 'STILL_OPEN') throw err;
                        if (!window.confirm('The exam is still open. Close it now and publish? Students who are answering are submitted with what they saved.')) return;
                        await post(`/exams/${id}/publish`, { force: true });
                      }
                      refresh();
                    })
                  }
                >
                  Publish result
                </Button>
              )}
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Edit
              </Button>
              {exam.status !== 'published' && (
                <Button
                  variant="ghost"
                  onClick={() =>
                    window.confirm('Delete this exam and all its marks?') && act(async () => (await del(`/exams/${id}`), navigate('/admin/exams')))
                  }
                >
                  Delete
                </Button>
              )}
            </div>
          </div>
          <Alert>{error}</Alert>

          {exam.stats.present + exam.stats.absent > 0 && (
            <dl className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              {[
                ['Sat the exam', exam.stats.present],
                ['Absent', exam.stats.absent],
                ['Average', num(exam.stats.average)],
                ['Highest', num(exam.stats.highest)],
                ['Passed', exam.passMarks > 0 ? exam.stats.passed : '–'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-line bg-white px-3 py-3">
                  <dd className="text-2xl font-bold">{value}</dd>
                  <dt className="text-sm text-ink-soft">{label}</dt>
                </div>
              ))}
            </dl>
          )}

          {exam.mode === 'online' && exam.status === 'draft' && <OnlineExam exam={exam} onChanged={refresh} version={version} />}
          {exam.mode !== 'online' && exam.status === 'draft' && marksPanel}

          <Panel title="Results">
            <ResultsTable exam={exam} version={version} />
          </Panel>

          {exam.mode === 'google_form' && <QuestionAnalysis exam={exam} onChanged={refresh} version={version} />}

          {exam.mode === 'online' && exam.status !== 'draft' && <OnlineExam exam={exam} onChanged={refresh} version={version} />}
          {exam.mode !== 'online' && exam.status !== 'draft' && marksPanel}

          <Modal open={editing} onClose={() => setEditing(false)} title="Edit exam">
            {editing && (
              <ExamForm
                initial={exam}
                onCancel={() => setEditing(false)}
                onSaved={() => {
                  setEditing(false);
                  refresh();
                }}
              />
            )}
          </Modal>
        </div>
        );
      }}
    </Loading>
  );
}
