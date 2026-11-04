# BioHelix: ki ki korte hobe (step by step)

Code sob ready. Tomar kaaj shudhu nicher step gula.

## 1. Notun code tomar folder e boshao

1. Zip ta extract koro.
2. Bhitorer **sob file/folder** copy kore `C:\Users\ahasa\OneDrive\Desktop\D\bioHelix\biohelix-portal` e paste koro, "Replace" dao.
   - Tomar `server\.env` file zip e nai, tai oita thik thakbe. Mucbe na.
3. VS Code terminal e (project folder e):
   ```
   npm run setup
   npm run build
   ```
4. Local e check korte chaile: `npm run dev:server` ar arekta terminal e `npm run dev:client`, tarpor http://localhost:5173 kholo. Home page e public website dekhbe.

## 2. GitHub e push

```
git status
git add .
git commit -m "Public website, SMS, Bangla portal, teacher role, deploy files"
git push
```

`git status` e jodi `.env` ba kono `backup` json dekhao, **add korba na**. (.gitignore e deya ache, normally ashbe na.)

## 3. Northflank e deploy (free Sandbox, ghumay na)

1. Atlas → **Network Access** → Add IP → **Allow access from anywhere** (0.0.0.0/0).
2. northflank.com → **GitHub diye sign up** → bioHelix repo te access dao.
3. **Create project** (region Asia/Singapore thakle oita).
4. **Create new → Service → Combined service**
   - Repo: `bioHelix`, branch `main`
   - Build type: **Dockerfile** (path `/Dockerfile`)
   - Port: **5000**, HTTP, **Public** on
   - Environment variables (secret hishebe):
     - `NODE_ENV` = `production`
     - `MONGODB_URI` = tomar `.env` er ta
     - `JWT_SECRET` = notun lomba random text. Banate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
5. **Create service** → kichukkhon build hobe → ekta link dibe (`https://...code.run`). Oita i website.
6. Erpor jotobar `git push` korba, nije nije update hobe.

## 4. Real use er age (launch checklist)

1. Admin panel → **Backup** → ekta backup download koro (safe rakhte).
2. Test data muche felo (programs ar tomar admin account thakbe):
   ```
   npm run reset-data -- --confirm biohelix
   ```
3. **Team** page → Shuvo bhai ke **admin** hishebe add koro. Temporary password dibe, first login e nije bodlabe. Teacher thakle **teacher** role dao (fee/SMS/backup dekhte parbe na).
4. **Public website** page → phone, WhatsApp, Facebook link, address, Google Maps link, about, achievements (je student ra permission dise).
5. **Batches** → real batch (din, time, seat, admission fee, monthly fee). Tarpor students.
6. Website link Facebook page e dao. Student ra phone e "Add to Home screen" dile app er moto khulbe.

## 5. SMS chalu kora (jokhon ready)

1. sms.net.bd (Alpha SMS) e account kholo, bKash diye kichu SMS credit kino.
2. Oder panel → **API** → API key copy.
3. Northflank → service → Environment → `SMS_API_KEY` = oi key. Optional: `PUBLIC_URL` = tomar website link. Save → restart.
4. Admin → **SMS** → test SMS pathao → tarpor je auto SMS gula chao on koro (absent, result, fee).
5. Er por student ra **"Password bhule gesen?"** diye SMS code e nije password reset korte parbe.

## Notun jinish gula kivabe use korbe

- **Online MCQ exam:** Exams → New exam → "Online MCQ on this website". Exam page e box e proshno paste koro (Word/Docs theke), format:
  ```
  1. Proshno
  ক) option
  খ) option
  গ) option
  ঘ) option
  উত্তর: খ
  অধ্যায়: Cell
  ব্যাখ্যা: ...
  ```
  (A) B) C) D) / Answer: B o chole.) Save → Edit e "Opens at" ar "Closes at" dao. Student ra portal er **পরীক্ষা** tab theke dibe, timer chole, auto save hoy. Shesh hole **Publish result**: merit, top 10, sob proshner uttor + ব্যাখ্যা dekhbe. Uttor bhul dile pore thik korle sobar number abar hishab hoy.
- **Lecture sheets:** Google Drive e PDF rekhe "Anyone with the link" kore link dao, ba YouTube e Unlisted video. Student ra **নোট** tab e pabe.
- **Accounts:** bhara, teacher salary egula entry dile mash shese ay-byay-labh ar 12 maser chart.
- **ID card:** Students → ID cards → batch select → Print (A4 e 10 ta, kete nibe).
- **Fee due SMS:** Fees → Who owes → "SMS reminder to all" (dine ekbar).
- **Facebook e link share** korle logo shoho preview ashbe. Google e ashte: Google Search Console e site add kore `.../sitemap.xml` submit koro (optional).

## Ja build kora hoy nai

- **Online fee payment (bKash/Nagad gateway)**: merchant account ar business document lage. Ekhon office e / personal bKash e fee niye panel e entry dao, receipt print hoy.
- **Question bank (ager bochhorer medical proshno):** eta code na, content. Online exam diyei "Practice set" banano jay: proshno paste kore lomba closing time dile student ra jokhon khushi practice korbe.
- **Proshne chobi (diagram):** ekhon text only. Dorkar hole pore add kora jabe.

## Mone rakhba

- `.env` ar backup file kokhono GitHub e dibe na. Backup e student der phone number ache, private jaygay (nijer Google Drive) rakho.
- Atlas er free tier nije backup rakhe na, tai shoptahe ekbar Backup page theke download koro. Dashboard mone koriye dibe.
