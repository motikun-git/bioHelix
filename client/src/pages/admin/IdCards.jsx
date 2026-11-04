import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import QRCode from 'qrcode';
import { get } from '../../lib/api.js';
import { useBatches } from '../../lib/data.js';
import { Alert, Button, Select, Spinner } from '../../components/ui.jsx';
import { Avatar } from './Students.jsx';

/** All active students of a batch (100 per page on the server). */
async function loadStudents(batch) {
  const all = [];
  for (let page = 1; page < 50; page += 1) {
    const res = await get(`/students?status=active&limit=100&page=${page}${batch ? `&batch=${batch}` : ''}`);
    all.push(...res.items);
    if (page >= res.pages) break;
  }
  return all.sort((a, b) => a.studentId.localeCompare(b.studentId));
}

function Card({ s, qr }) {
  return (
    <div className="id-card flex flex-col overflow-hidden rounded-[3mm] border border-line bg-white">
      <div className="flex items-center gap-[2mm] bg-ink px-[3mm] py-[1.5mm] text-white">
        <img src="/logo-mark.png" alt="" className="h-[6mm] w-[6mm] rounded-[1mm] bg-white" />
        <div className="leading-tight">
          <p className="text-[9pt] font-bold">BioHelix</p>
          <p className="text-[6pt] text-white/80">Academic and Admission</p>
        </div>
        <p className="ml-auto text-[6.5pt] font-semibold uppercase tracking-wide text-[#5cc7bd]">Student ID</p>
      </div>
      <div className="flex flex-1 items-center gap-[3mm] px-[3mm] py-[2mm]">
        <Avatar url={s.photoUrl} name={s.name} size="h-[20mm] w-[16mm] !rounded-[1.5mm]" />
        <div className="min-w-0 flex-1 leading-snug">
          <p className="truncate text-[9.5pt] font-bold">{s.name}</p>
          <p className="text-[10pt] font-bold text-helix-dark">{s.studentId}</p>
          <p className="truncate text-[7pt] text-ink-soft">{s.program?.name}</p>
          <p className="truncate text-[7pt] text-ink-soft">{s.batch?.name}</p>
          {s.session && <p className="truncate text-[7pt] text-ink-soft">{s.session}</p>}
        </div>
        {qr && <img src={qr} alt="" className="h-[17mm] w-[17mm] shrink-0" />}
      </div>
    </div>
  );
}

export default function IdCards() {
  const [params, setParams] = useSearchParams();
  const batch = params.get('batch') || '';
  const batches = useBatches('?active=true');
  const [students, setStudents] = useState(null);
  const [qrs, setQrs] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    setStudents(null);
    setError('');
    loadStudents(batch)
      .then(async (list) => {
        const codes = {};
        for (const s of list) codes[s._id] = await QRCode.toDataURL(s.studentId, { margin: 0, width: 160, errorCorrectionLevel: 'M' });
        setQrs(codes);
        setStudents(list);
      })
      .catch((err) => setError(err.message));
  }, [batch]);

  return (
    <div>
      <style>{`
        .id-card { width: 85.6mm; height: 54mm; break-inside: avoid; }
        @media print {
          @page { size: A4; margin: 10mm; }
          html, body { background: white !important; }
          body * { visibility: hidden; }
          #id-sheet, #id-sheet * { visibility: visible; }
          #id-sheet { position: absolute; left: 0; top: 0; }
          .id-card { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/admin/students" className="text-sm font-semibold text-helix-dark">
            Students
          </Link>
          <h1 className="text-2xl font-bold">Student ID cards</h1>
          <p className="text-ink-soft">Print on A4 (10 cards per page), cut along the borders. The QR code holds the Student ID.</p>
        </div>
        <div className="flex gap-2">
          <Select value={batch} onChange={(e) => setParams(e.target.value ? { batch: e.target.value } : {})} className="w-auto" aria-label="Batch">
            <option value="">All active students</option>
            {batches.data?.map((b) => (
              <option key={b._id} value={b._id}>
                {b.name}
              </option>
            ))}
          </Select>
          <Button onClick={() => window.print()} disabled={!students?.length}>
            Print
          </Button>
        </div>
      </div>
      <Alert>{error}</Alert>
      {!students && !error && (
        <div className="grid place-items-center py-16">
          <Spinner />
        </div>
      )}
      {students?.length === 0 && <p className="text-ink-soft">No active students in this batch.</p>}
      {students?.length > 0 && (
        <div id="id-sheet" className="grid w-fit grid-cols-1 gap-[4mm] sm:grid-cols-2">
          {students.map((s) => (
            <Card key={s._id} s={s} qr={qrs[s._id]} />
          ))}
        </div>
      )}
    </div>
  );
}
