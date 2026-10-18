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

### Step 2.5: ImgBB setup (thumbnails ke liye)

> **v4:** KHR ki ImgBB key app mein pehle se lagi hui hai, is liye ye step ab zaroori nahi. Key badalni ho to neeche wala tareeqa use karein. GitHub secret `VITE_IMGBB_API_KEY` dene se wo purani key ki jagah le leti hai.

1. **imgbb.com** par jayein aur **Sign up** kar ke free account banayein.
2. **api.imgbb.com** kholein aur **"Get API key"** dabayein.
3. Wahan jo lambi key aaye, use copy kar lein. Ye Step 3 mein `VITE_IMGBB_API_KEY` secret mein jayegi.

Thumbnail upload hone par seedha ImgBB par jati hai. Wahan se jo image link milta hai, wo Supabase mein usi din ke task mein save hota hai.

> Note: ye key app ke andar hoti hai, is liye koi technical banda app khol kar ise nikal sakta hai aur aap ke ImgBB account par images daal sakta hai. Is ke liye ImgBB ka alag account banayein, apna personal account use na karein. Key leak ho jaye to api.imgbb.com par nayi key bana kar GitHub secret badal dein.

### Step 3: Secrets add karein (keys chhupa kar)

Repo mein **Settings → Secrets and variables → Actions → New repository secret** kholein. Ye secrets ek ek kar ke add karein:

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | Step 1 wala Project URL |
| `VITE_SUPABASE_ANON_KEY` | Step 1 wali anon public key |
| `VITE_IMGBB_API_KEY` | ImgBB ki API key (neeche "ImgBB setup" dekhein) |
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

## v3: Har role ka apna waqt + Task attachments

### Role-wise timeline

- Channel ka ab ek single time nahi. **Channel edit → "Har role ka waqt (daily timeline)"** mein har role ka apna **Start** aur **Deadline** set hota hai.
  - Misal: Script Writer 9:00–12:00, Voice Over 12:00–2:00, Editor 2:00–8:00.
- Daily tasks inhi waqt ke hisaab se bante hain. Pending mein "Shuru 2:00 PM" nazar aata hai jab tak us role ka waqt shuru na ho.
- Agar deadline start se pehle ho (misal: 11 PM se 1 AM), to deadline **agle din** ki maani jati hai, jo raat ki shift ke liye hai.
- Channel page par **"Roz ki timeline"** mein sab roles ek 24 ghante ki line par nazar aate hain: kaun kab shuru karta hai aur kab khatam.
- Aaj waqt badlein to aaj ke pending tasks ki deadline bhi foran badal jati hai. Complete ho chuke tasks waise hi rehte hain.

### Task attachments (Script link + Thumbnail)

- Kisi bhi task par tap karein. **Attachments** section khulta hai.
- **Script ka link:** Google Docs, Drive ya Notion ka link paste kar ke Save karein.
- **Thumbnail:** "Thumbnail upload karein" dabayein aur phone ya PC se image chunein.
  - Image ImgBB par chali jati hai, aur us ka link isi task mein save ho jata hai.
- Ye attachments **sirf usi din ke usi task** ke saath hain. Raat ko jab agle din ka naya task banta hai, us ki attachments **khaali** hoti hain.
- Us channel ki poori team aur owner attachments laga, badal aur hata sakte hain. Sab ko ye foran (real-time) nazar aata hai.
- Task row par chhota "Script link" chip aur thumbnail ki tasveer nazar aati hai.

---

## v4: Channel ki scripts, thumbnails, live timer aur messages

### Har channel card mein 3 buttons: Scripts · Thumbnails · Messages

Ye buttons in jagahon par hain:
- dashboard ke channel cards par
- Aaj ke tasks ke har channel group mein
- channel page par
- task kholne par

**Scripts:**
- Button par aaj ki scripts ki ginti hoti hai. Agar aaj 3 scripts lagi hain to card par **3** aur un ke **titles** nazar aate hain.
- Button dabane par aaj ki aur **pichli saari scripts** khulti hain, har din ki alag list mein, title, waqt aur lagane wale ke naam ke saath.
- Kisi script par tap karein to wo khul jati hai:
  - link wali script ka link aur "Script kholein" button
  - app mein likhi script poori parhne ke liye
- Nayi script do tarah add hoti hai:
  - **Link daalein:** Google Docs / Drive
  - **Yahin likhein:** script seedha app mein likhein

**Thumbnails:**
- Isi tarah aaj ke thumbnails card par chhoti tasveeron ke saath nazar aate hain, aur button mein poori history date ke saath hoti hai.
- Tap karne par thumbnail bara khulta hai.
- Upload hone par image ImgBB par jati hai.

**Naya din:** naye din ki list khaali shuru hoti hai. Purani scripts aur thumbnails history mein rehti hain.

**Messages:**
- Har channel ki apni chat hai. Sirf us channel ki team aur owner use dekh sakte hain.
- Kisi message par **Reply** kar sakte hain.
- Link bhejein to wo khud clickable ban jata hai.
- Naye messages ho to button par laal ginti nazar aati hai.
- Apna message delete kar sakte hain. Owner kisi ka bhi message delete kar sakta hai.

### Dashboard: pehle channel, phir us ke tasks

Pending, Deadline expired aur Completed, teeno sections mein tasks ab **channel ke hisaab se group** hain:
1. Upar channel ka naam aur us ke Scripts / Thumbs / Chat buttons hote hain.
2. Neeche us channel ke tasks, tick ke saath.

### Live timer (har task par)

| Halat | Kya nazar aata hai |
|---|---|
| Waqt abhi shuru nahi hua | **ABHI WAQT NAHI** · "01:12:30 mein shuru" (neela) |
| Waqt chal raha hai | **WAQT CHAL RAHA HAI** · "02:14:09 baqi" har second kam hota hai, aur progress bar (aakhri 30 minute mein peela) |
| Deadline guzar gayi | **DEADLINE GUZAR GAYI** · "00:42:10 se late" (laal) |
| Complete | **WAQT PAR COMPLETE** ya **LATE COMPLETE**, aur deadline se kitna pehle ya baad hua |

Task kholne par timer bara nazar aata hai.

---

## v5: KHR Server (Discord jaisa)

Neeche tab bar mein **Server** ka naya button hai. Ye sab ke liye hai.

### Channels
- Owner **+ Channel** se server channel banata hai. Har channel ki settings mein ye hota hai:
  - **Naam aur maqsad (topic)**
  - **Category**, jaise Information, Team 1, Team 2. Channels category ke hisaab se group hote hain.
  - **Sirf owner message kare (📢):** baaqi sab parh sakte hain, likh nahi sakte, jaise announcement.
  - **Private (🔒):** sirf chune hue log aur owner channel dekh sakte hain. Kisi ko list se hatayein to channel us se foran chhup jata hai.
- Pehli dafa server mein 2 channel khud ban jate hain: `announcement` (sirf owner) aur `general`.
- Channel mein message, **reply**, aur **image** (📷 button) bhej sakte hain. Links khud clickable bante hain.
- Naye messages wale channel ke aage laal ginti aati hai.

### Roles aur members
- Owner kisi member par tap kar ke us ka **server role** likhta hai, jaise Co-Founder, GM, Script Writer.
- Members list role ke hisaab se group hoti hai. Online log upar hare nishan ke saath, offline neeche halke rang mein.
- Har banda apni **profile photo** laga sakta hai: upar apni photo → "Profile photo lagayein".

### Friends aur DMs
- Kisi se alag baat karni ho to pehle **friend request** bhejein: Members → us par tap → "+ Friend request".
- Samne wala **Accept** kare to dono jitne chahein message aur image bhej sakte hain.
- Owner se baat ke liye friend request ki zaroorat nahi.
- DM mein "Bheja" aur "Parh liya" nazar aata hai.

### Images aur photos kahan jati hain
- Saari images (chat, DM, profile photo) **ImgBB** par upload hoti hain.
- Supabase mein sirf message ka text aur image ka **link** save hota hai, image ki file nahi.

### Owner: Company records
- Owner apne profile mein neeche **"Company records"** se kisi bhi do logon ki DM parh sakta hai, naam ya baat se dhoond kar.
- Ye option sirf owner ko nazar aata hai.
- Har DM screen par team ko ye line dikhti hai: "Company chat: sirf kaam ki baat karein. Company policy ke mutabiq owner ye chat review kar sakta hai."

---

## v6: Dark/Light mode, notifications aur behtar server

**Rang (theme):**
- Upar ☀/☾ button se light aur dark mode badlein. Profile mein "Phone jaisa" bhi chun sakte hain.
- Dark mode mein dark blue background aur dark red rang hain. Light mode mein halke shade.
- Har channel card ka apna rang hai: dark mein gehra, light mein halka.

**Profile photo:** ek dafa lagayein to poori app mein nazar aati hai: header, team, ranking, progress, chats aur server. Photo ImgBB par jati hai.

**Server:**
- Server kholte hi **pichli dafa khula channel** khul jata hai. Friends tab mein **pichli khuli DM**.
- "Members" tab hata diya gaya. Right side par **sirf us channel ke log** nazar aate hain:
  - private channel mein sirf add kiye gaye log aur owner
  - public channel mein poori team
- DM khuli ho to right side band rehti hai.
- PC par server poori window mein Discord ki tarah chalta hai: left mein channels/friends, beech mein chat, right mein log.
- Phone par channel ke log "👥" button mein milte hain.
- Friend request ke liye: Friends → "Team · friend banayein", ya kisi ke naam par tap karein.

**Tick ka rule:** jab tak role ka start time nahi aata, tick nahi hota. Gol nishan par 🔒 nazar aata hai. Database bhi ise rokta hai.

**Notifications (🔔):** in moqon par alert aata hai:
- naya message (server, channel chat, DM)
- kisi ne task complete kiya (owner ko)
- task reject hua
- naya kaam ya role assign hua
- friend request aayi ya accept hui
- nayi script ya thumbnail lagi
- deadline shuru hui
- deadline mein 10 minute baqi
- deadline khatam hui

Notifications kaise kaam karti hain:
- Ghanti mein "On karein" dabayein to phone/PC par bhi alert aata hai.
- Android app mein **deadline ke alerts pehle se phone par schedule** ho jate hain, is liye app band ho tab bhi aate hain.
- Messages aur ticks ke alerts tab aate hain jab app khuli ho ya background mein chal rahi ho.
  - App bilkul band ho tab bhi message ka alert chahiye to Firebase push lagani hogi. Wo agla step hai.

**Scripts/Thumbnails history:**
- Aaj ki scripts aur thumbnails card par nazar aati hain. Agle din wo **History** mein chali jati hain.
- Card par "Scripts history" aur "Thumbnails history" buttons hain. In mein har cheez title, waqt aur date ke saath hoti hai.
- Thumbnail ka **title ab zaroori** hai, taake file ka ajeeb naam title na bane.

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
