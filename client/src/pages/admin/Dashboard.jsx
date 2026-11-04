import { Link } from 'react-router';
import { get } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { dayLabel, formatDate, formatTime, monthLabel, num, taka } from '../../lib/format.js';
import { Empty, Loading, PageHeader, StatusBadge, cx, useLoad } from '../../components/ui.jsx';
import { daysSince } from './Backup.jsx';

function Stat({ value, label, to, tone }) {
  return (
    <Link to={to} className="rounded-xl border border-line bg-white px-4 py-4 hover:border-helix">
      <p className={cx('text-3xl font-bold', tone)}>{value}</p>
      <p className="text-sm text-ink-soft">{label}</p>
    </Link>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const state = useLoad(() => get('/dashboard'));

  return (
    <Loading state={state}>
      {(d) => (
        <div className="space-y-6">
          <PageHeader title={`Hello, ${user?.name?.split(' ')[0] || 'admin'}`} subtitle={dayLabel(d.today, true)} />

          {d.role === 'admin' && d.students.total > 0 && (d.lastBackupAt === null || daysSince(d.lastBackupAt) > 7) && (
            <Link to="/admin/backup" className="flex items-center justify-between gap-3 rounded-xl border border-draft/40 bg-draft-tint px-4 py-3 text-draft">
              <span className="font-semibold">
                {d.lastBackupAt ? `Last backup was ${daysSince(d.lastBackupAt)} days ago.` : 'No backup taken yet.'} Download one now.
              </span>
              <span className="shrink-0 font-semibold underline">Backup</span>
            </Link>
          )}

          {d.newInquiries > 0 && (
            <Link to="/admin/inquiries" className="flex items-center justify-between gap-3 rounded-xl border border-helix/40 bg-helix-tint px-4 py-3 text-helix-dark">
              <span className="font-semibold">
                {d.newInquiries} new admission {d.newInquiries === 1 ? 'inquiry' : 'inquiries'} from the website. Call them back.
              </span>
              <span className="shrink-0 font-semibold underline">Open</span>
            </Link>
          )}

          {d.batches.active === 0 ? (
            <Empty
              title="Start by creating a batch"
              action={
                <Link to="/admin/batches" className="font-semibold text-helix-dark underline">
                  Create a batch
                </Link>
              }
            >
              Every student belongs to a batch, so add your HSC and Admission batches first. Then add students.
            </Empty>
          ) : (
            <section>
              <h2 className="mb-2 text-lg font-semibold">Classes today</h2>
              {d.classesToday.length === 0 ? (
                <p className="rounded-xl border border-line bg-white px-4 py-3 text-ink-soft">No batch has class today.</p>
              ) : (
                <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
                  {d.classesToday.map((c) => (
                    <li key={c._id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{c.name}</p>
                        <p className="text-sm text-ink-soft">
                          {c.startTime ? formatTime(c.startTime) : 'No time set'}
                          {c.taken && `, ${c.present} present, ${c.absent} absent`}
                        </p>
                      </div>
                      <Link
                        to={`/admin/attendance?batch=${c._id}`}
                        className={cx(
                          'shrink-0 rounded-lg px-3 py-2 text-sm font-semibold',
                          c.taken ? 'border border-line text-ink-soft hover:text-ink' : 'bg-helix text-white hover:bg-helix-dark',
                        )}
                      >
                        {c.taken ? 'Edit attendance' : 'Take attendance'}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat value={d.students.active} label="Active students" to="/admin/students" />
            {d.fees ? (
              <>
                <Stat value={taka(d.fees.collected)} label={`Collected in ${monthLabel(d.fees.month, true)}`} to="/admin/fees?tab=payments" />
                <Stat value={d.fees.studentsWithDue} label={`Students with dues (${taka(d.fees.totalDue)})`} to="/admin/fees?tab=dues" tone={d.fees.studentsWithDue ? 'text-fail' : ''} />
              </>
            ) : (
              <Stat value={d.batches.active} label="Running batches" to="/admin/batches" />
            )}
            <Stat value={d.exams.imported + d.exams.draft} label="Exams not published" to="/admin/exams" />
          </div>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Recent exams</h2>
              <Link to="/admin/exams" className="text-sm font-semibold text-helix-dark">
                All exams
              </Link>
            </div>
            {d.recentExams.length === 0 ? (
              <Empty title="No exams yet">Create an exam, then import the Google Form sheet or type the marks.</Empty>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
                {d.recentExams.map((e) => (
                  <li key={e._id}>
                    <Link to={`/admin/exams/${e._id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-paper">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{e.title}</p>
                        <p className="text-sm text-ink-soft">
                          {formatDate(e.date)}
                          {e.stats.present > 0 && `, average ${num(e.stats.average)} of ${e.totalMarks}`}
                        </p>
                      </div>
                      <StatusBadge status={e.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Loading>
  );
}
