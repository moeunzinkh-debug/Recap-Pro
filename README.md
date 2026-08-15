# 🎬 Recap Pro — ស្ទូឌីយោបង្កើតស្គ្រីបសម្រាយរឿង និង Anime AI

កម្មវិធី AI បង្កើតអត្ថបទស្គ្រីបអានសម្លេងសម្រាយរឿង និង Anime ជាភាសាខ្មែរដោយស្វ័យប្រវត្តិ ដោយប្រើ Google Gemini។

- **Frontend**: React + Vite + Tailwind (ទាញយករូបភាពប្លង់ពីវីដេអូនៅក្នុង Browser)
- **Backend**: Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite) — API Key ត្រូវបានអ៊ិនគ្រីបមុនរក្សាទុក (AES-256-GCM)
- **Storage fallback**: បើគ្មាន D1 binding ទេ Worker នៅតែដំណើរការដោយប្រើ in-memory (ទិន្នន័យមិនបានរក្សាទុក)

---

## 🖥️ ដំណើរការក្នុងម៉ាស៊ីនមូលដ្ឋាន (Local Development)

```bash
npm install
npm run dev        # http://localhost:3000 (HMR + in-memory storage)
```

ឬសាកល្បងដូច production (ប្រើ dist/ build):

```bash
npm run preview
```

ឬដំណើរការជាមួយ Cloudflare runtime ក្នុងម៉ាស៊ីន (Wrangler + D1 ពិតប្រាកដ)៖

```bash
npm run db:create   # ត្រូវ login ជាមួយ npx wrangler login ជាមុន
npm run build
npm run dev:worker
```

---

## ☁️ Deploy ទៅ Cloudflare Workers

### 1. ដំឡើង dependencies និង login

```bash
npm install
npx wrangler login
```

### 2. បង្កើត Database (D1) — ធ្វើតែម្តងប៉ុណ្ណោះ

```bash
npm run db:create
```

ស្គ្រីបនេះបង្កើត database ឈ្មោះ `recap-pro-db` នៅក្នុង account របស់អ្នក ហើយបញ្ចូល binding `RECAPS_DB` ទៅក្នុង `wrangler.jsonc` ដោយស្វ័យប្រវត្តិ។
(តារាងទិន្នន័យត្រូវបានបង្កើតដោយស្វ័យប្រវត្តិនៅពេលដំណើរការលើកដំបូង — មិនចាំបាច់ run migration ទេ។)

### 3. (ជម្រើស) កំណត់ GEMINI_API_KEY ជា secret

```bash
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put APP_SECRET   # ប្រើសម្រាប់អ៊ិនគ្រីប API Key (ណែនាំឱ្យកំណត់)
```

> 💡 មិនចាំបាច់ទេ — អ្នកក៏អាចបញ្ចូល Gemini API Key ក្នុងទំព័រ **Settings (ផ្ទាំងកំណត់)** របស់កម្មវិធីបានដែរ វានឹងត្រូវរក្សាទុកដោយអ៊ិនគ្រីបនៅក្នុង D1។

### 4. Deploy

```bash
npm run deploy
```

នៅពេល deploy ចប់ អ្នកនឹងឃើញ URL របស់ Worker (ឧទាហរណ៍ `https://recap-pro.<subdomain>.workers.dev`) — បើកវានៅក្នុង Browser បានភ្លាមៗ ✅

**Deploy លើកបន្ទាប់** គ្រាន់តែ `npm run deploy` ម្តងទៀត។

---

## ⚙️ ស្ថាបត្យកម្ម (How it works)

| ផ្នែក | ការពិពណ៌នា |
| --- | --- |
| `worker.ts` | ចំណុចចូលរបស់ Worker — គ្រប់គ្រង `/api/*` ទាំងអស់ |
| `src/lib/store.ts` | Storage layer (D1 → in-memory fallback) |
| `src/lib/gemini.ts` | ហៅ Google Gemini REST API ដោយផ្ទាល់តាម `fetch` (ដំណើរការលើ Workers ដោយមិនបាច់ Node SDK) |
| `src/lib/crypto.ts` | អ៊ិនគ្រីប/ឌិគ្រីប API Key ដោយ Web Crypto (AES-256-GCM) |
| `wrangler.jsonc` | Config របស់ Worker + Static Assets (`dist/`) + D1 binding |
| `dev.ts` | Local dev server (Node) — រត់ worker code ដដែល + Vite HMR |

### ការបង្កើតស្គ្រីប (Generation flow)

1. Browser ទាញយករូបភាពប្លង់ (frames) ពីវីដេអូដោយ Canvas
2. `POST /api/recaps` បង្កើតធាតុ `processing` ហើយចាប់ផ្តើមហៅ Gemini
3. Worker រង់ចាំក្នុង request រហូតដល់ 25 វិនាទី (HTTP request របស់ Workers គ្មានកំណត់ wall-time ដរាបណា client នៅតភ្ជាប់) រួចឆ្លើយតប `recapId` ហើយបន្តបង្កើតតាម `ctx.waitUntil()` (~30s ទៀត) បើនៅមិនទាន់ចប់
4. Frontend poll `GET /api/recaps/:id` រៀងរាល់ 2.5s រហូតដល់ `done`/`failed`
5. បើដំណើរការជាប់គាំងលើស 3 នាទី (ឧ. Worker ត្រូវបានបញ្ឈប់) វានឹងត្រូវសម្គាល់ជា `failed` ដោយស្វ័យប្រវត្តិ ដើម្បីឲ្យអ្នកអាចសាកល្បងម្តងទៀត

### 📌 ចំណាំអំពី Limits របស់ Cloudflare

- **Workers Free plan**: CPU 10 ms/request — សម្រាប់វីដេអូធំៗ (frames ច្រើន) អាចមិនគ្រប់។ ប្រើ **Workers Paid ($5/ខែ)** នឹងមាន CPU 30s — អាចបន្ថែម `"limits": { "cpu_ms": 300000 }` ក្នុង `wrangler.jsonc`។ កុំកំណត់ `limits.cpu_ms` ពេលប្រើ Free plan ព្រោះ deploy នឹងបរាជ័យជាមួយកំហុស 100328។
- Gemini generation ភាគច្រើនជាការរង់ចាំ network I/O — មិនចំណាយ CPU ច្រើនទេ។
- បើ generation ត្រូវបានកាត់ផ្តាច់ដោយ runtime សូមសាកល្បងវីដេអូខ្លីជាង ឬម៉ូដែលលឿនជាង (ឧ. `gemini-2.5-flash-lite` / `gemini-2.0-flash`)។

---

## 🧪 Scripts

| Script | ការពិពណ៌នា |
| --- | --- |
| `npm run dev` | Local dev ជាមួយ Vite HMR (in-memory storage) |
| `npm run build` | Build frontend ទៅ `dist/` |
| `npm run preview` | សាកល្បង production build ក្នុងម៉ាស៊ីន |
| `npm run db:create` | បង្កើត D1 database + បញ្ចូល binding ទៅ wrangler.jsonc |
| `npm run deploy` | Build + Deploy ទៅ Cloudflare Workers |
| `npm run dev:worker` | ដំណើរការជាមួយ Wrangler (Cloudflare runtime + D1) |
| `npm run lint` | TypeScript type check |

---

## 🔑 Environment Variables

| Variable | ការពិពណ៌នា | ចាំបាច់? |
| --- | --- | --- |
| `GEMINI_API_KEY` | Gemini AI API key | ទេ — អាចបញ្ចូលក្នុង Settings បាន |
| `APP_SECRET` | Key សម្រាប់អ៊ិនគ្រីប API Key នៅពេលរក្សាទុក | ណែនាំ — បើអត់ នឹងប្រើ default |
| `DATABASE_URL` | (ទុកសម្រាប់ backward compatibility) | ទេ |
