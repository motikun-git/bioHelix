import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import './index.css';
import { AuthProvider, RequireRole } from './lib/auth.jsx';
import { AdminLayout, AdminMore, PortalLayout } from './components/Layouts.jsx';
import { AdminLogin, ChangePassword, ForgotPassword, StudentLogin } from './pages/Auth.jsx';
import { LangProvider } from './lib/i18n.jsx';
import { AdmissionPage, PublicHome, PublicLayout } from './pages/Public.jsx';
import { Inquiries, WebsiteSettings } from './pages/admin/SiteAdmin.jsx';
import Sms from './pages/admin/Sms.jsx';
import Materials from './pages/admin/Materials.jsx';
import IdCards from './pages/admin/IdCards.jsx';
import { ExamReview, PortalExams, PortalMaterials, TakeExam } from './pages/portal/PortalExams.jsx';
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
import Team from './pages/admin/Team.jsx';

/** Pages teachers can't open (the server blocks them too). */
const adminOnly = (page) => <RequireRole role="admin">{page}</RequireRole>;

// The chart library is big, so the student portal loads it only when needed
const PortalHome = lazy(() => import('./pages/portal/Portal.jsx'));
const ResultDetail = lazy(() => import('./pages/portal/Portal.jsx').then((m) => ({ default: m.ResultDetail })));
const PortalAttendance = lazy(() => import('./pages/portal/PortalPages.jsx').then((m) => ({ default: m.PortalAttendance })));
const PortalSchedule = lazy(() => import('./pages/portal/PortalPages.jsx').then((m) => ({ default: m.PortalSchedule })));
// Charts again: load the accounts page only when an admin opens it
const Accounts = lazy(() => import('./pages/admin/Accounts.jsx'));
const PortalFees = lazy(() => import('./pages/portal/PortalPages.jsx').then((m) => ({ default: m.PortalFees })));

const fallback = (
  <div className="grid place-items-center py-16">
    <Spinner />
  </div>
);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <LangProvider>
      <AuthProvider>
        <Suspense fallback={fallback}>
          <Routes>
            <Route element={<PublicLayout />}>
              <Route index element={<PublicHome />} />
              <Route path="admission" element={<AdmissionPage />} />
            </Route>
            <Route path="/login" element={<StudentLogin />} />
            <Route path="/forgot" element={<ForgotPassword />} />
            <Route
              path="/admin/login"
              element={
                <LangProvider forced="en">
                  <AdminLogin />
                </LangProvider>
              }
            />

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
              <Route path="exams" element={<PortalExams />} />
              <Route path="exams/:id/take" element={<TakeExam />} />
              <Route path="exams/:id/review" element={<ExamReview />} />
              <Route path="materials" element={<PortalMaterials />} />
              <Route path="password" element={<ChangePassword />} />
            </Route>

            <Route
              path="/admin"
              element={
                <LangProvider forced="en">
                  <RequireRole role="staff">
                    <AdminLayout />
                  </RequireRole>
                </LangProvider>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="students" element={<Students />} />
              <Route path="students/new" element={adminOnly(<StudentNew />)} />
              <Route path="students/import" element={adminOnly(<StudentImport />)} />
              <Route path="students/cards" element={<IdCards />} />
              <Route path="students/:id" element={<StudentDetail />} />
              <Route path="exams" element={<Exams />} />
              <Route path="exams/:id" element={<ExamDetail />} />
              <Route path="batches" element={<Batches />} />
              <Route path="attendance" element={<Attendance />} />
              <Route path="notices" element={<Notices />} />
              <Route path="calendar" element={<Calendar />} />
              <Route path="fees" element={adminOnly(<Fees />)} />
              <Route path="fees/receipt/:id" element={adminOnly(<Receipt />)} />
              <Route path="more" element={<AdminMore />} />
              <Route path="backup" element={adminOnly(<Backup />)} />
              <Route path="team" element={adminOnly(<Team />)} />
              <Route path="inquiries" element={adminOnly(<Inquiries />)} />
              <Route path="website" element={adminOnly(<WebsiteSettings />)} />
              <Route path="sms" element={adminOnly(<Sms />)} />
              <Route path="materials" element={<Materials />} />
              <Route path="accounts" element={adminOnly(<Accounts />)} />
              <Route path="password" element={<ChangePassword />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
      </LangProvider>
    </BrowserRouter>
  </StrictMode>,
);
