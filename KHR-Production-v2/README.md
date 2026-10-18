# KHR Production

Video production team ka app: channel cards, team approval, roles, performance %, daily views, aaj ke kaam, aur scripts.

Ek hi code se ye sab banta hai:

| Kya | Kahan chalega | Kaise milega |
|---|---|---|
| **APK** | Android phone (seedha install) | GitHub Releases se download |
| **AAB** | Google Play Store | Play Console mein upload |
| **Setup .exe** | Windows PC | GitHub Releases se download |
| **Web app** | Kisi bhi PC/phone browser mein, "Install" bhi hoti hai | GitHub Pages link |

Backend: **Supabase** (login, database, live sync). Free plan kaafi hai.

---

## Setup — ek dafa karna hai (lag bhag 30–40 minute)

### Step 1: Supabase backend banayein

1. **supabase.com** par jayein, "Start your project" dabayein aur GitHub ya email se account banayein.
2. **New project** banayein:
   - Name: `khr-production`
   - Database password: koi mazboot password likh kar sambhal lein.
   - Region: **Singapore** ya **Mumbai** chunein (Pakistan ke qareeb, is liye tez chalega).
3. Project ban jaye to left menu mein **SQL Editor** kholein aur **New query** dabayein.
4. Is project ki file `supabase/schema.sql` kholein, poora text copy kar ke wahan paste karein, phir **Run** dabayein. "Success" aana chahiye.
5. **Authentication → Sign In / Providers → Email** kholein aur **"Confirm email"** ko **OFF** kar dein, phir Save karein.
   - Is ki wajah: owner har bande ko khud approve karta hai, is liye email confirm ki zaroorat nahi, aur mobile app mein email link ka masla nahi hota.
6. **Project Settings → API** (ya "Data API") kholein aur do cheezein copy kar ke rakh lein:
   - **Project URL**, jo `https://xxxx.supabase.co` jaisa hoga.
   - **anon public** key, jo lambi `eyJ...` line hogi. **service_role** key kabhi kisi ko na dein.

> **Zaroori:** App mein **sab se pehle jo account banega wo OWNER** banega. Is liye sab se pehle aap khud account banayein, team ko baad mein dein.

### Step 2: Code GitHub par daalein

1. **github.com** par account banayein (agar nahi hai).
2. Upar **+ → New repository** dabayein. Name `khr-production` rakhein, **Public** chunein, aur **Create** karein.
   - Public is liye ke APK ka download link sab ke liye khul sake. Code public hona masla nahi, kyunke secret keys GitHub Secrets mein chhupi rehti hain.
   - Agar **Private** rakhna hai to bhi chalega, lekin phir sirf aap login kar ke download kar sakenge aur team ko file khud bhejni hogi.
3. Repo page par **"uploading an existing file"** link dabayein.
4. Is zip ko unzip karein aur `khr-production` folder ke **andar ki saari files aur folders** drag kar ke daal dein, phir **Commit changes** dabayein.
   - `.github` folder bhi upload hona zaroori hai. Agar wo nazar na aaye to neeche "Agar .github upload na ho" dekhein.

### Step 3: Secrets add karein (keys chhupa kar)

Repo mein **Settings → Secrets and variables → Actions → New repository secret** kholein. Ye secrets ek ek kar ke add karein:

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | Step 1 wala Project URL |
| `VITE_SUPABASE_ANON_KEY` | Step 1 wali anon public key |
| `KHR_KEY_ALIAS` | `KHR-signing-secrets.txt` file se |
| `KHR_KEYSTORE_PASSWORD` | `KHR-signing-secrets.txt` file se |
| `KHR_KEY_PASSWORD` | `KHR-signing-secrets.txt` file se |
| `KHR_KEYSTORE_BASE64` | `KHR-signing-secrets.txt` file se (lambi line) |

Aakhri 4 secrets app ki **signing key** hain. Inhi ki wajah se APK "release" banti hai aur Play Store par upload ho sakti hai.

- `khr-release.jks` aur `KHR-signing-secrets.txt` ka backup **zaroor** rakhein.
- Ye key kho gayi to Play Store par purani app update nahi hogi.

### Step 4: Web app chalu karein (PC ke liye link)

1. Repo mein **Settings → Pages** kholein.
2. **Source** mein **GitHub Actions** chunein.

### Step 5: Build chalayein

1. Repo mein **Actions** tab kholein. Agar wahan "I understand… enable" button aaye to dabayein.
2. **Build KHR Production → Run workflow → Run workflow** dabayein.
3. 10–15 minute mein sab ✅ green ho jayega.
4. Repo ke main page par daayein taraf **Releases** mein **KHR Production 1.0.x** nazar aayega. Us mein ye files hongi:
   - `KHR-Production-1.0.x.apk`: Android phone ke liye
   - `KHR-Production-1.0.x-playstore.aab`: Google Play Store ke liye
   - `KHR-Production-Setup-1.0.x.exe`: Windows PC ke liye
5. Web app ka link **Settings → Pages** par milega, jaise `https://AAPKA-USERNAME.github.io/khr-production/`.

Aage se jab bhi code badlega, ye sab khud dobara ban jayega aur version number barh jayega.

---

## Install kaise karein

### Android phone (APK)

1. Phone mein Releases page kholein aur `.apk` file download karein.
2. File kholein. Agar Android "Install unknown apps" ki ijazat maange to **Settings → Allow from this source** on karein.
3. **Install** dabayein. "KHR Production" icon home screen par aa jayega.

### Google Play Store

1. **play.google.com/console** par developer account banayein. Is ki ek dafa fees $25 hai.
2. **Create app** dabayein. Naam "KHR Production" rakhein.
3. **Testing → Internal testing** ya **Production → Create release** kholein aur `-playstore.aab` file upload karein.
4. Store listing mukammal karein: icon, screenshots, description aur privacy policy.
5. Phir review ke liye bhejein.
6. Nayi version ke liye bas naya AAB upload karein. Version number khud barhta hai.

### Windows PC

**Tareeqa 1:** `KHR-Production-Setup-….exe` download kar ke chalayein.
- Agar Windows "protected your PC" ki warning de to **More info → Run anyway** dabayein.
- Ye warning is liye aati hai ke app ka Microsoft certificate nahi liya gaya.
- Install hone ke baad Desktop aur Start Menu mein icon aa jayega.

**Tareeqa 2:** Chrome ya Edge mein web app ka link kholein, phir address bar mein **Install** (⊕) icon dabayein.

### iPhone

Safari mein web app ka link kholein, phir **Share → Add to Home Screen** dabayein.

---

## Daily tasks, progress aur leaderboard

### Tasks khud kaise bante hain

- Har din, jis channel ka kaam ka din hai, us ke **har member ke har role ka ek task** khud ban jata hai.
  - Misal: Rehan ka Tech Urdu mein Script Writer aur Editor role hai, aur Tech Urdu roz chalta hai. To Rehan ko roz 2 tasks milenge.
- **Deadline** = us din channel ka "Kaam khatam" time. Agar time set nahi to raat 11:59.
- Tasks database khud banata hai: raat 12:05 par (pg_cron se), aur jab bhi koi app khole.
  - Agar kisi din koi app na khole to agli dafa app khulne par chhoote hue din (31 din tak) bhi ban jate hain.

### Aaj ke kaam (3 sections)

| Section | Kab |
|---|---|
| **Pending** | Task bana hai, deadline abhi nahi aayi |
| **Deadline expired** | Deadline guzar gayi aur tick nahi hua (pichle 7 din ke bhi yahan nazar aate hain) |
| **Completed** | Banda ne tick kar diya (ya owner ne reject kiya, laal ✕ ke saath) |

- Member apne task ke aage gol nishan par **tick** kare to task Completed mein chala jata hai.
- Ghalti se tick ho jaye to dobara tap kare. Task wapas **apni purani deadline ke mutabiq** Pending ya Expired mein aa jata hai.
- Deadline ke baad tick karne se task complete hota hai, lekin "deadline ke baad" (late) likha aata hai.

### Owner ka Reject

- Agar koi jaan bujh kar kaam der se ya deadline par karta hai, to owner us task par **Reject** dabaye aur wajah chune.
- Rejected task **complete mein count nahi hota**, aur upar se **5% mazeed minus** hota hai:
  - us din ki progress mein
  - us hafte ki progress mein
  - us mahine ki progress mein
- Leaderboard aur profile par "X rejected" nazar aata hai.
- Member rejected task ko untick nahi kar sakta.
- Owner ghalti se reject kare to **"Wapas lein"** se rejection hata sakta hai.

### Progress ka formula

```
Progress % = (complete tasks ÷ jin tasks ki deadline guzar chuki) × 100  −  (5 × rejected tasks)
```

- Jin tasks ki deadline abhi nahi aayi, wo count nahi hote. Is liye din ke beech mein kisi ka % nahi girta.
- Misal: hafte mein 10 tasks ki deadline guzri. 8 complete hue, 1 reject hua, 1 miss hua. Progress = 8/10 × 100 − 5 = **75%**.

### Kahan kya nazar aata hai

- **Aaj tab:**
  - Member: apne tasks ke 3 sections, aur upar Aaj / Is hafte / Is mahine ki progress.
  - Owner: poori team ke tasks, aur har task par Reject ka button.
- **Progress:**
  - Member ki apni progress "Progress" tab mein hai.
  - Owner Team tab mein kisi bhi bande par tap kar ke us ki progress dekh sakta hai.
  - Daily / Weekly / Monthly chun sakte hain, aur ‹ › se pichle din, hafte ya mahine dekh sakte hain.
  - Har channel aur har role ki alag progress, aur tasks ki poori history.
- **Channel ke andar:** us channel ke aaj ke tasks, aur har member ke har role ki task progress (Aaj / Is hafte / Is mahine).
- **Ranking tab:** poori team ke liye public leaderboard.
  - Top 3 podium par, baqi neeche list mein.
  - Daily, Weekly aur Monthly. Monthly reward ke liye ‹ dabakar pichla mahina dekhein.

### Channel ki team baad mein badalna

- Channel kholein, phir **Team / roles badlein** dabayein. Wahan kisi ko add, remove, ya role change kar sakte hain.
- Save karne se pehle neeche **"Is channel ki team"** mein nazar aata hai ke kis bande ka kaun sa role hai.
- Tabdeeli **aaj se** lagu hoti hai:
  - Hataye gaye role ka aaj ka pending task hat jata hai.
  - Naye role ka task aaj se banta hai.
  - Purani history aur progress waisi hi rehti hai.

---

## Pehle se setup kiya hua hai? Update kaise karein

1. **Supabase → SQL Editor → New query** kholein. Nayi `supabase/schema.sql` poori paste kar ke **Run** karein.
   - Purana data safe rehta hai. Sirf naye tables aur functions add hote hain.
2. GitHub repo mein nayi zip ki files upload karein. Purani files replace hongi.
3. Actions khud chalega aur Releases mein nayi APK, AAB aur .exe aa jayegi.
4. Phone par nayi APK install karein. Ye purani app ke upar update ho jayegi, data waisa hi rahega.
   - Ye tabhi hota hai jab signing key wahi ho.

**pg_cron:**
- Agar SQL chalate waqt "pg_cron set nahi hua" ka notice aaye to koi masla nahi, tasks phir bhi app khulne par bante hain.
- Raat ko khud banwane ke liye: Supabase **Integrations → Cron** enable karein aur `schema.sql` dobara Run karein.

---

## App kaise chalti hai

**Owner (aap):**
- Sab se pehle **Naya account** banayein. Pehla account owner ban jata hai.
- **Team** tab mein naye logon ki requests aati hain. Wahan se **Approve** ya **Reject** karein.
- **Channels → + Naya** se channel card banayein:
  - About likhein.
  - Kaam ke din chunein: Roz, ya khaas din jaise Mon aur Thu.
  - Kaam ka time aur deadline set karein.
  - Har bande ko roles dein: Script Writer, Editor, Manager, Graphic Designer, Publisher, Voice Over.
- Channel kholein, phir **Performance dein** dabayein. Har bande ke har role ko 0–100% number dein. Purane number history mein rehte hain.
- Channel ke andar har din ke **views** likhein.

**Team member:**
- App install kare, **Naya account** banaye, aur apna naam aur ID (WhatsApp) bheje.
- Owner ke approve karne tak "Approval ka intezar" screen nazar aati hai.
- Approve hone ke baad har (channel + role) ka **alag card** milta hai. Misal: Rehan ke 2 channels mein Script Writer, 1 mein Manager aur 1 mein Editor ka role hai, to use 4 cards milenge.
- **Aaj** tab mein sirf wahi cards aate hain jin channels ka aaj kaam ka din hai.
- Har card par us role ki performance %, channel ke views aur schedule nazar aata hai.
- Channel ke andar **Videos** hain:
  - Script Writer script likhta hai.
  - Editor aur Manager stage aage barhate hain: Idea → Script → Editing → Thumbnail → Review → Published.

**Security (database khud lagu karta hai, app se bypass nahi hoti):**
- Member khud ko approve nahi kar sakta.
- Member sirf apne channels dekh sakta hai.
- Member sirf apni performance dekh sakta hai, doosron ki nahi.
- Channels, roles, performance aur views sirf owner badal sakta hai.
- Videos sirf owner delete kar sakta hai.

---

## Masle aur hal

**Agar `.github` upload na ho:**
1. Repo mein **Add file → Create new file** dabayein.
2. Naam mein likhein: `.github/workflows/build.yml`
3. Is project ki `.github/workflows/build.yml` file ka poora text paste karein aur **Commit** karein.

**Actions mein laal ❌ aaye:**
- Us job ko kholein aur error parhein.
- Aksar wajah ye hoti hai ke secret ka naam ghalat likha gaya, ya value mein extra space reh gaya.

**App mein "Email ya password ghalat":**
- Supabase mein **Authentication → Users** mein check karein.

**Kisi member ka password bhool gaya:**
- Supabase **Authentication → Users** mein us user ko delete karein.
- Phir wo naya account banaye, aur aap dobara approve karein.

**Owner badalna ho:**
- Supabase **Table Editor → profiles** kholein.
- Naye owner ki row mein `is_owner` ko `true` karein.

---

## Developers ke liye

```bash
npm install
cp .env.example .env              # Supabase URL + anon key likhein
npm run dev                       # browser mein chalayein
npm run android:prepare           # android/ project tayyar (Android Studio se khol kar Run)
```

- Stack: React 18 + TypeScript + Vite, Capacitor 7 (Android), Electron (Windows), vite-plugin-pwa, Supabase (Postgres + RLS + Realtime).
- Icons dobara banane ke liye: `python3 scripts/make_icons.py scripts/brand-font.woff …` (Pillow chahiye).
