# BioHelix Portal

Student, exam and result management for **BioHelix Academic and Admission**.
Public website with admission form, admin panel (students, batches, attendance, exams from Google Form or offline marks, results analysis, fees, notices, SMS, team, backup) and a Bangla/English student and guardian portal (results, merit position, progress, attendance, routine, fees).

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

Create the programs and the first admin account (more admins and teachers can be added later from **Team**):

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

## Backup and restore

Atlas's free tier keeps no backups, so take your own.

- **Admin panel → Backup → Download backup.** Saves one `.json` file with everything (students, results, attendance, fees, notices, logins). The dashboard reminds you if the last backup is older than 7 days.
- **From the terminal:** `npm run backup` saves the same file into `server/backups/`.

The file contains phone numbers and password hashes: keep it in a private place (your own Google Drive). `backups/` and `biohelix-backup-*.json` are in `.gitignore`.

**Restore** (replaces ALL current data):

```bash
npm run restore -- "C:\path\to\biohelix-backup-2026-11-03-1530.json"                     # check only, changes nothing
npm run restore -- "C:\path\to\biohelix-backup-2026-11-03-1530.json" --confirm biohelix  # really restore
```

Before restoring, the current data is saved to `server/backups/before-restore-….json`, so a wrong restore can be undone the same way. Use the full path to the file.

## 4. Deploy (Northflank + MongoDB Atlas)

The repo has a `Dockerfile`, so any host that builds Docker images works. Northflank's free **Sandbox** keeps one small service running all the time (no sleeping) without a card.

1. **Atlas → Network Access → Add IP Address → Allow access from anywhere (`0.0.0.0/0`).** Free hosts have no fixed IP; the long database password protects it.
2. **northflank.com → sign up with GitHub** and allow access to the `bioHelix` repo.
3. **Create project** (region: the one closest to Bangladesh, e.g. Singapore/Asia if offered).
4. In the project: **Create new → Service → Combined service** (build + run together).
   - Repository: `bioHelix`, branch `main`.
   - Build type: **Dockerfile**, path `/Dockerfile`, build context `/`.
   - Resources: the free/sandbox plan.
   - Networking: port **5000**, protocol **HTTP**, **Public** on.
   - Environment variables (mark them secret):
     - `NODE_ENV` = `production`
     - `MONGODB_URI` = same as in `server/.env`
     - `JWT_SECRET` = a NEW long random value (see section 1)
     - later, when you have them: `CLOUDINARY_*`, `GOOGLE_*`, `SMS_API_KEY`, `PUBLIC_URL`
   - Health check (optional): HTTP `GET /api/health` on port 5000.
5. **Create service.** The first build takes a few minutes. Northflank shows the public URL (`https://….code.run`). Open it: the public website. `/admin/login` for admins.
6. Every `git push` to `main` rebuilds and redeploys.

`render.yaml` is still there if you ever want Render instead (its free plan sleeps after 15 minutes).

### Before real students use it (launch checklist)

1. Take a backup, then clear the test data (keeps programs and your admin account):
   ```bash
   npm run reset-data                                   # shows what would be deleted
   npm run reset-data -- --confirm biohelix             # really deletes
   npm run reset-data -- --confirm biohelix --remove-staff --keep you@example.com   # also removes other staff
   ```
2. Admin panel → **Team** → add Shuvo (admin) and any teachers. Each gets a temporary password and must change it on first login.
3. **Public website** → phone, WhatsApp, Facebook link, address, Google Maps link, about text, achievements.
4. **Batches** → real batches with days, time, seats (capacity) and fees. Then students.
5. Share the site link on the Facebook page. Students can "Add to Home screen" on their phone; it opens like an app.

## SMS (sms.net.bd / Alpha SMS)

Off until `SMS_API_KEY` is set. Then **Admin → SMS**:

- Automatic SMS (each can be turned on separately): absent in class, exam result (marks + merit position) when published, fee received (with receipt number). Send to guardian (falls back to the student's number), student, or both. The same news is never sent twice.
- Send one message to a batch or to all active students, with a letter/SMS counter (Bangla: 70 letters per SMS).
- Test SMS, balance, and a log of the last 100 SMS.
- Students' **Forgot password** sends a 6-digit code (valid 10 minutes, 5 tries, rate limited) to the student's and guardian's numbers.

Env: `SMS_API_KEY` (from the sms.net.bd panel → API), optional `SMS_SENDER_ID` (after they approve a sender name), `PUBLIC_URL` (the site address, added to result SMS). `SMS_DRY_RUN=1` writes to the log without sending (for testing).

## Public website and admission inquiries

- `/` home page (about, programs and batches with class days, seats left, optional fees, achievements, contact), `/admission` form. Bangla by default with an English switch; the choice is remembered.
- Form submissions appear in **Admin → Admission inquiries** (call, note, mark called/closed). **Admit as student** opens Add student with the details filled in and marks the inquiry admitted.
- Spam protection: hidden honeypot field, 5 submissions per hour per network.

## Staff roles

- **Admin**: everything.
- **Teacher**: dashboard (no money), students (read only, no fees), attendance, exams and marks, notices, calendar, batches (read only). No fees, SMS, website, team or backup.

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
| Online MCQ exams | Paste questions (A-D or ক-ঘ, Answer:, Chapter:, Explanation:), set time, opening/closing time and negative marks; live count of who started/submitted; fix the answer key later (everyone re-marked) | Sit the exam on the phone with a timer and autosave (works through short network drops), marks right after submitting, answers with explanations after the result |
| Merit list | Toggle on the Public website page | Top 10 names on every published result |
| Lecture sheets | Google Drive / YouTube links per program or batch | “Notes” tab |
| Accounts | Expenses (rent, salary, ...), income vs expense, 12-month charts of income, students and attendance | |
| ID cards | Print A4 sheets of ID cards with photo and QR code, per batch | |
| SMS | Due reminder to everyone on the due list (once a day) | |

Late counts as attended. A payment can only be deleted on the day it was entered.

**Not built:** online fee payment (bKash/Nagad payment gateway needs a merchant account and business documents). Fees are collected at the office or by personal bKash and recorded here.

### Online MCQ exams

1. **Exams → New exam → Online MCQ on this website.** Set total marks, time per student and the cut per wrong answer (e.g. 0.25).
2. Paste the questions in the box on the exam page and **Save questions**. Check **Preview as students see it**.
3. **Edit** the exam and set **Opens at** (and **Closes at**). Until "Opens at" is set students cannot see the exam.
4. Students open **Exams** in the portal and start. Each gets the full time from when they start, but never past the closing time. Answers are saved as they go; when time is up the exam submits itself.
5. After it closes, **Publish result**: anyone still answering is submitted with what they saved, anyone who never started is marked absent, ranks are calculated, result SMS go out (if on). Students then see their merit position, the top 10 and every answer with its explanation.

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
| GET/POST | `/auth/student/forgot`, POST `/auth/student/reset` | public, SMS code |
| GET | `/public/site` | public website data |
| POST | `/public/inquiries` | public admission form |
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
| GET | `/backup/info`, `/backup/download` | full database export |
| GET | `/dashboard` | admin and teacher |
| CRUD | `/team` | staff accounts, POST `/team/:id/reset-password` |
| GET/PUT | `/site`, CRUD `/site/achievements` | website content |
| GET/PATCH/DELETE | `/inquiries` | admission inquiries |
| GET | `/sms`; PUT `/sms/settings`; POST `/sms/send`, `/sms/test`, `/sms/dues` | SMS |
| GET/PUT | `/exams/:id/mcq` | online exam questions and attempt counts |
| CRUD | `/materials` | admins and teachers |
| GET | `/accounts/summary?month=`; CRUD `/accounts/expenses` | admin only |
| GET | `/me/exams`; POST `/me/exams/:id/start`, `/me/exams/:id/submit`; PUT `/me/exams/:id/answers`; GET `/me/exams/:id/review` | student only |
| GET | `/me/materials` | student only |
| GET | `/me`, `/me/results`, `/me/results/:examId`, `/me/chapters` | student only |
| GET | `/me/attendance?month=`, `/me/schedule`, `/me/notices`, `/me/fees` | student only |
