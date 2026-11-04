import { useState } from 'react';
import { get, put } from '../../lib/api.js';
import { Alert, Button, Input, Loading, Panel, PercentBar, cx, useLoad } from '../../components/ui.jsx';

/** Tell the system which column is which question, its correct answer and chapter. */
function QuestionSetup({ exam, onSaved, onCancel }) {
  const state = useLoad(() => get(`/exams/${exam._id}/questions`), [exam._id]);
  const [rows, setRows] = useState(null);
  const [allChapter, setAllChapter] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const init = (data) => {
    const saved = new Map(data.questions.map((q) => [q.column, q]));
    return data.candidates.map((c) => ({
      ...c,
      include: saved.size ? saved.has(c.column) : true,
      answer: saved.get(c.column)?.answer || '',
      chapter: saved.get(c.column)?.chapter || '',
    }));
  };

  const save = async (list) => {
    setError('');
    const chosen = list.filter((r) => r.include);
    const missing = chosen.find((r) => !r.answer.trim());
    if (missing) return setError(`Set the correct answer for "${missing.text}"`);
    setBusy(true);
    try {
      await put(`/exams/${exam._id}/questions`, {
        questions: chosen.map((r) => ({ column: r.column, answer: r.answer.trim(), chapter: r.chapter.trim() })),
      });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Loading state={state}>
      {(data) => {
        const list = rows || init(data);
        const update = (i, patch) => setRows(list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
        const chapters = [...new Set(list.map((r) => r.chapter).filter(Boolean))];
        if (!list.length) return <p className="text-ink-soft">No question columns found in the imported sheet.</p>;
        return (
          <div className="space-y-4">
            <p className="text-sm text-ink-soft">
              {data.responses} responses. For each question, pick the correct answer (students&apos; answers are listed, most common first) and type its chapter. Untick columns that are not questions.
            </p>
            <div className="flex flex-wrap items-end gap-2 rounded-lg bg-paper p-3">
              <label className="flex-1">
                <span className="mb-1 block text-sm font-semibold">Same chapter for every question?</span>
                <Input value={allChapter} onChange={(e) => setAllChapter(e.target.value)} placeholder="e.g. Cell Biology" />
              </label>
              <Button variant="secondary" disabled={!allChapter.trim()} onClick={() => setRows(list.map((r) => ({ ...r, chapter: allChapter.trim() })))}>
                Apply to all
              </Button>
            </div>
            <datalist id="chapter-list">
              {chapters.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <ol className="space-y-3">
              {list.map((r, i) => (
                <li key={r.column} className={cx('rounded-lg border p-3', r.include ? 'border-line bg-white' : 'border-dashed border-line bg-paper opacity-70')}>
                  <label className="flex items-start gap-2">
                    <input type="checkbox" className="mt-1 size-5 shrink-0 accent-helix" checked={r.include} onChange={(e) => update(i, { include: e.target.checked })} />
                    <span className="font-semibold">{r.text || `Column ${r.column + 1}`}</span>
                  </label>
                  {r.include && (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <label>
                        <span className="mb-1 block text-xs font-semibold text-ink-soft">Correct answer</span>
                        <Input list={`answers-${r.column}`} value={r.answer} onChange={(e) => update(i, { answer: e.target.value })} placeholder="Choose or type" />
                        <datalist id={`answers-${r.column}`}>
                          {r.options.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.count} students
                            </option>
                          ))}
                        </datalist>
                      </label>
                      <label>
                        <span className="mb-1 block text-xs font-semibold text-ink-soft">Chapter</span>
                        <Input list="chapter-list" value={r.chapter} onChange={(e) => update(i, { chapter: e.target.value })} placeholder="e.g. Genetics" />
                      </label>
                    </div>
                  )}
                </li>
              ))}
            </ol>
            <Alert>{error}</Alert>
            <div className="flex gap-2">
              <Button onClick={() => save(list)} loading={busy}>
                Save questions
              </Button>
              {onCancel && (
                <Button variant="secondary" onClick={onCancel}>
                  Cancel
                </Button>
              )}
            </div>
          </div>
        );
      }}
    </Loading>
  );
}

export function AnalysisView({ exam, version }) {
  const state = useLoad(() => get(`/exams/${exam._id}/analysis`), [exam._id, version]);
  return (
    <Loading state={state}>
      {(a) => (
        <div className="space-y-6">
          <section>
            <h3 className="mb-1 font-semibold">Chapters, weakest first</h3>
            <p className="mb-3 text-sm text-ink-soft">Share of answers that were correct, across {a.responses} students.</p>
            <ul className="space-y-3">
              {a.chapters.map((c) => (
                <li key={c.chapter}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-semibold">{c.chapter}</span>
                    <span>
                      {c.percent}% <span className="text-ink-soft">({c.questions} {c.questions === 1 ? 'question' : 'questions'})</span>
                    </span>
                  </div>
                  <PercentBar value={c.percent} />
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="mb-2 font-semibold">Each question</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-ink-soft">
                  <tr className="border-b border-line">
                    <th className="py-2 pr-2 font-semibold">#</th>
                    <th className="py-2 pr-2 font-semibold">Question</th>
                    <th className="py-2 pr-2 text-right font-semibold">Correct</th>
                    <th className="hidden py-2 font-semibold sm:table-cell">Most common wrong answer</th>
                  </tr>
                </thead>
                <tbody>
                  {a.questions.map((q) => (
                    <tr key={q.column} className="border-b border-line align-top last:border-0">
                      <td className="py-2 pr-2 font-semibold">{q.number}</td>
                      <td className="py-2 pr-2">
                        {q.text}
                        <span className="block text-xs text-ink-soft">
                          {q.chapter}, answer: {q.answer}
                        </span>
                        {q.commonWrong && (
                          <span className="block text-xs text-fail sm:hidden">
                            Often wrong: {q.commonWrong.value} ({q.commonWrong.count})
                          </span>
                        )}
                      </td>
                      <td className={cx('py-2 pr-2 text-right font-bold', q.percent < 40 ? 'text-fail' : q.percent < 70 ? 'text-draft' : 'text-pass')}>{q.percent}%</td>
                      <td className="hidden py-2 text-ink-soft sm:table-cell">{q.commonWrong ? `${q.commonWrong.value} (${q.commonWrong.count})` : '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </Loading>
  );
}

export default function QuestionAnalysis({ exam, onChanged, version }) {
  const [editing, setEditing] = useState(false);
  if (!exam.sheetHeaders?.length) {
    return (
      <Panel title="Question analysis">
        <p className="text-ink-soft">Import the Google Form responses first. Then you can set the answer key and chapters to see which questions and chapters students find hard.</p>
      </Panel>
    );
  }
  const setUp = exam.questions?.length > 0;
  return (
    <Panel
      title="Question analysis"
      action={
        setUp &&
        !editing && (
          <button className="text-sm font-semibold text-helix-dark" onClick={() => setEditing(true)}>
            Edit questions
          </button>
        )
      }
    >
      {!setUp || editing ? (
        <QuestionSetup
          exam={exam}
          onCancel={setUp ? () => setEditing(false) : undefined}
          onSaved={() => {
            setEditing(false);
            onChanged();
          }}
        />
      ) : (
        <AnalysisView exam={exam} version={version} />
      )}
    </Panel>
  );
}
