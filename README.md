# BioHelix Portal

Student, exam and result management for **BioHelix Academic and Admission**.
Phase 1: admin panel (students, batches, exams, Google Form / offline marks, publishing) and a student/guardian portal (results, rank, progress).

```
biohelix-portal/
├── server/   Express + MongoDB (Mongoose) API
└── client/   React (Vite) + Tailwind app
```

In production the Express server also serves the built React app, so the whole thing is **one service, one URL**. That keeps the login cookie on the same site (no cross-site cookie problems on iPhone/Safari).

---

## 1. Run it on your computer

Needs **Node.js 20.19+** (or 22.12+).

```bash
npm run setup                     # installs server + client packages
cp server/.env.example server/.env
```

Open `server/.env` and fill in at least:

- `MONGODB_URI` — from MongoDB Atlas (Connect → Drivers). Put `/biohelix` before the `?`.
- `JWT_SECRET` — run `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` and paste the output.

Create the programs and the two admin accounts (run once per admin):

```bash
npm run seed -- --name "Shuvo" --email shuvo@example.com --password "choose-a-long-password"
npm run seed -- --name "Second Admin" --email admin2@example.com --password "another-long-password"
```

Start it (two terminals):

```bash
npm run dev:server    # API on http://localhost:5000
npm run dev:client    # app on http://localhost:5173
```

Open http://localhost:5173/admin/login.

## 2. First steps in the app

1. **Batches** → create HSC and Admission batches (days and class time).
2. **Students** → add one by one, or **Import CSV** for a whole batch. Each student gets an ID like `BH-H26-0001` and a temporary password. Give these to the student (download the login sheet after a CSV import).
3. **Exams** → New exam → choose batches, Google Form or offline, total and pass marks.
4. Bring the marks in, check the results table, then **Publish result**. Only published results are visible to students; ranks are calculated on publish.

Students log in at `/login` with Student ID + password and must set their own password the first time. Guardians use the same login.

### Student CSV format

Only `name` is required. Header names are flexible:

```csv
name,phone,guardianName,guardianPhone,college
Tasnim Rahman,01712345678,Abdur Rahman,01812345678,Holy Cross College
```

### Google Form rules (for every exam)

- Turn on **Quiz mode** and set the answer key, so the response sheet has a `Score` column.
- First question: **Student ID** (short answer, required).
- Keep the form structure the same for every exam.
- If a student submits twice, the **first** submission counts.

## 3. Optional services

### Student photos (Cloudinary)

Create a free Cloudinary account → Dashboard → API keys → fill `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
Photos are uploaded as private ("authenticated") images, resized to 400×400, and shown only through signed links. Without these keys everything else works; photo upload shows a message.

### Reading Google Sheets directly

Without this you can still download the response sheet as CSV and use **Upload CSV**.

1. Go to https://console.cloud.google.com → create a project (e.g. "biohelix").
2. APIs & Services → Library → enable **Google Sheets API**.
3. APIs & Services → Credentials → Create credentials → **Service account**. Then open it → Keys → Add key → JSON. A file downloads.
4. From that JSON file copy `client_email` into `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `private_key` into `GOOGLE_PRIVATE_KEY` (keep it on one line, in double quotes, with the `\n` parts).
5. For every form's response sheet: **Share** → paste the service account email → **Viewer**.

Never commit `.env` or the JSON key to GitHub.

## 4. Deploy (Render + MongoDB Atlas)

1. Push this folder to a **private** GitHub repo.
2. MongoDB Atlas → Network Access → allow `0.0.0.0/0` (Render has no fixed IP on small plans). Use a strong database user password.
3. Render → New → **Web Service** → connect the repo.
   - Build command: `npm run build`
   - Start command: `npm start`
   - Instance: **Starter** (the free one sleeps after 15 minutes and takes about a minute to wake up)
   - Environment: everything from `server/.env`, plus `NODE_ENV=production`
4. After the first deploy, open the Render Shell and run the seed command (section 1) to create admins.
5. Add your domain in Render → Settings → Custom domains.

## 5. Features

| Area | What admins do | What students/guardians see |
| --- | --- | --- |
| Students | Add, CSV import, photo, edit, move batch, reset password, scholarship fee | Profile |
| Batches | Class days/time, admission and monthly fee | Weekly routine |
| Attendance | Tap P / L / A per student, edit past days, monthly report | Month calendar, overall % |
| Exams | Google Sheet or CSV import, offline marks grid, publish, ranks | Marks, rank, progress chart |
| Question analysis | Set answer key + chapter per Google Form question; see hardest questions and chapters | Own chapter-wise accuracy vs average |
| Notices | Post to everyone, a program or some batches; pin | Notice list |
| Calendar | Extra classes, holidays (exams appear automatically) | Upcoming 45 days |
| Fees | Collect payment, printable receipt (BH-R26-00001), due list, monthly collection | Month-by-month paid/due, payment history |

Late counts as attended. A payment can only be deleted on the day it was entered.

**Not built yet:** SMS (needs a gateway account, e.g. Alpha SMS), online payment (bKash/Nagad gateway), teacher role.

### Question analysis (Google Form exams)

1. Import the responses as usual (the whole response row is saved).
2. On the exam page, under **Question analysis**, each question column is listed with the answers students gave. Pick the correct answer and type the chapter.
3. Save. The exam page shows each question's % correct and the most common wrong answer, and students see their chapter-wise accuracy once the result is published.

If the form's questions change and you re-import, the question setup resets.

### API overview

All routes are under `/api`. Admin-only unless noted.

| Method | Route | Notes |
| --- | --- | --- |
| POST | `/auth/admin/login`, `/auth/student/login` | public, rate limited |
| GET | `/auth/session` | any logged-in user |
| PATCH | `/auth/password` | any logged-in user |
| GET/POST | `/programs`, `/batches` | PATCH/DELETE `/batches/:id` |
| GET/POST | `/students` | `?q=&batch=&status=&page=` |
| POST | `/students/import` | multipart: `file`, `batch` |
| GET/PATCH | `/students/:id` | |
| POST | `/students/:id/photo`, `/students/:id/reset-password` | |
| GET/POST | `/exams` | GET/PATCH/DELETE `/exams/:id` |
| POST | `/exams/:id/sheet/preview`, `/exams/:id/sheet/import` | Google Sheets |
| POST | `/exams/:id/csv/preview`, `/exams/:id/csv/import` | multipart CSV |
| GET/PUT | `/exams/:id/roster`, `/exams/:id/marks` | offline marks |
| GET | `/exams/:id/results` | |
| POST | `/exams/:id/publish`, `/exams/:id/unpublish` | |
| GET/PUT | `/exams/:id/questions` | question setup |
| GET | `/exams/:id/analysis` | question and chapter stats |
| GET/PUT | `/attendance?batch=&date=` | one day of one batch |
| GET | `/attendance/summary?batch=&month=`, `/attendance/today` | |
| CRUD | `/notices`, `/events` | GET `/events?from=&to=` includes exams |
| GET | `/fees/students/:id`, `/fees/dues?month=&batch=` | |
| GET/POST | `/fees/payments` | DELETE only same day |
| GET | `/dashboard` | |
| GET | `/me`, `/me/results`, `/me/results/:examId`, `/me/chapters` | student only |
| GET | `/me/attendance?month=`, `/me/schedule`, `/me/notices`, `/me/fees` | student only |
