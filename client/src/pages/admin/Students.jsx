import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { get } from '../../lib/api.js';
import { useBatches } from '../../lib/data.js';
import { useIsAdmin } from '../../lib/auth.jsx';
import { Button, ButtonLink, Empty, Input, Loading, PageHeader, Select, StatusBadge, useLoad } from '../../components/ui.jsx';

export function Avatar({ url, name, size = 'size-10' }) {
  if (url) return <img src={url} alt="" className={`${size} shrink-0 rounded-full object-cover`} />;
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  return (
    <span className={`${size} grid shrink-0 place-items-center rounded-full bg-helix-tint font-semibold text-helix-dark`} aria-hidden="true">
      {initials}
    </span>
  );
}

export default function Students() {
  const isAdmin = useIsAdmin();
  const [params, setParams] = useSearchParams();
  const batches = useBatches();
  const batch = params.get('batch') || '';
  const status = params.get('status') || 'active';
  const page = Number(params.get('page')) || 1;
  const [q, setQ] = useState(params.get('q') || '');

  // Search after the admin stops typing for a moment
  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get('q') || '') !== q) update({ q, page: '' });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function update(changes) {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next, { replace: true });
  }

  const query = new URLSearchParams({ status, page: String(page), ...(batch && { batch }), ...(params.get('q') && { q: params.get('q') }) });
  const students = useLoad(() => get(`/students?${query}`), [query.toString()]);

  return (
    <>
      <PageHeader
        title="Students"
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink to={`/admin/students/cards${batch ? `?batch=${batch}` : ''}`} variant="secondary">
              ID cards
            </ButtonLink>
            {isAdmin && (
              <>
                <ButtonLink to="/admin/students/import" variant="secondary">
                  Import CSV
                </ButtonLink>
                <ButtonLink to="/admin/students/new">Add student</ButtonLink>
              </>
            )}
          </div>
        }
      />

      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_14rem_10rem]">
        <Input type="search" placeholder="Search name, ID or phone" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search students" />
        <Select value={batch} onChange={(e) => update({ batch: e.target.value, page: '' })} aria-label="Batch">
          <option value="">All batches</option>
          {batches.data?.map((b) => (
            <option key={b._id} value={b._id}>
              {b.name}
            </option>
          ))}
        </Select>
        <Select value={status} onChange={(e) => update({ status: e.target.value === 'active' ? '' : e.target.value, page: '' })} aria-label="Status">
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="completed">Completed</option>
        </Select>
      </div>

      <Loading state={students}>
        {(data) =>
          data.items.length === 0 ? (
            <Empty
              title={params.get('q') || batch ? 'No students match' : 'No students yet'}
              action={
                !params.get('q') && (
                  <Link to="/admin/students/new" className="font-semibold text-helix-dark underline">
                    Add a student
                  </Link>
                )
              }
            >
              {params.get('q') || batch ? 'Try another search or batch.' : 'Add students one by one or import a CSV list.'}
            </Empty>
          ) : (
            <>
              <p className="mb-2 text-sm text-ink-soft">{data.total} students</p>
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
                {data.items.map((s) => (
                  <li key={s._id}>
                    <Link to={`/admin/students/${s._id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-paper">
                      <Avatar url={s.photoUrl} name={s.name} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{s.name}</p>
                        <p className="truncate text-sm text-ink-soft">
                          {s.studentId}, {s.batch?.name}
                        </p>
                      </div>
                      {s.status !== 'active' && <StatusBadge status={s.status} />}
                    </Link>
                  </li>
                ))}
              </ul>
              {data.pages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <Button variant="secondary" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>
                    Previous
                  </Button>
                  <span className="text-sm text-ink-soft">
                    Page {page} of {data.pages}
                  </span>
                  <Button variant="secondary" disabled={page >= data.pages} onClick={() => update({ page: String(page + 1) })}>
                    Next
                  </Button>
                </div>
              )}
            </>
          )
        }
      </Loading>
    </>
  );
}
