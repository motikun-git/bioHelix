import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import './index.css';
import { AuthProvider, RequireRole } from './lib/auth.jsx';
import { AdminLayout, AdminMore, PortalLayout } from './components/Layouts.jsx';
import { AdminLogin, ChangePassword, Home, StudentLogin } from './pages/Auth.jsx';
import { Spinner } from './components/ui.jsx';
import Dashboard from './pages/admin/Dashboard.jsx';
import Batches from './pages/admin/Batches.jsx';
import Students from './pages/admin/Students.jsx';
import StudentNew, { StudentImport } from './pages/admin/StudentNew.jsx';
import StudentDetail from './pages/admin/StudentDetail.jsx';
import Exams from './pages/admin/Exams.jsx';
import ExamDetail from './pages/admin/ExamDetail.jsx';
import Attendance from './pages/admin/Attendance.jsx';
import Notices, { Calendar } from './pages/admin/Notices.jsx';
import Fees, { Receipt } from './pages/admin/Fees.jsx';
import Backup from './pages/admin/Backup.jsx';

// The chart library is big, so the student portal loads it only when needed
const PortalHome = lazy(() => import('./pages/portal/Portal.jsx'));
const ResultDetail = lazy(() => import('./pages/portal/Portal.jsx').then((m) => ({ default: m.ResultDetail })));
const PortalAttendance = lazy(() => import('./pages/portal/PortalPages.jsx').then((m) => ({ default: m.PortalAttendance })));
const PortalSchedule = lazy(() => import('./pages/portal/PortalPages.jsx').then((m) => ({ default: m.PortalSchedule })));
const PortalFees = lazy(() => import('./pages/portal/PortalPages.jsx').then((m) => ({ default: m.PortalFees })));

const fallback = (
  <div className="grid place-items-center py-16">
    <Spinner />
  </div>
);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={fallback}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<StudentLogin />} />
            <Route path="/admin/login" element={<AdminLogin />} />

            <Route
              path="/portal"
              element={
                <RequireRole role="student">
                  <PortalLayout />
                </RequireRole>
              }
            >
              <Route index element={<PortalHome />} />
              <Route path="results/:examId" element={<ResultDetail />} />
              <Route path="attendance" element={<PortalAttendance />} />
              <Route path="schedule" element={<PortalSchedule />} />
              <Route path="fees" element={<PortalFees />} />
              <Route path="password" element={<ChangePassword />} />
            </Route>

            <Route
              path="/admin"
              element={
                <RequireRole role="admin">
                  <AdminLayout />
                </RequireRole>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="students" element={<Students />} />
              <Route path="students/new" element={<StudentNew />} />
              <Route path="students/import" element={<StudentImport />} />
              <Route path="students/:id" element={<StudentDetail />} />
              <Route path="exams" element={<Exams />} />
              <Route path="exams/:id" element={<ExamDetail />} />
              <Route path="batches" element={<Batches />} />
              <Route path="attendance" element={<Attendance />} />
              <Route path="notices" element={<Notices />} />
              <Route path="calendar" element={<Calendar />} />
              <Route path="fees" element={<Fees />} />
              <Route path="fees/receipt/:id" element={<Receipt />} />
              <Route path="more" element={<AdminMore />} />
              <Route path="backup" element={<Backup />} />
              <Route path="password" element={<ChangePassword />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
