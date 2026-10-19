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

## v7: Final fixes

- **Back button (phone):**
  - Server mein kisi channel ya DM mein ho to back dabane se pehle **server ki list** aati hai, dashboard nahi.
  - Khuli sheet ya tasveer bhi back se pehle band hoti hai.
- **Keyboard:** likhte waqt typing box **keyboard ke upar** aa jata hai aur neeche ki patti chhup jati hai, taake jo likh rahe hain wo nazar aaye. Ye chat, DM aur saari sheets mein hai.
- **KHR logo har jagah:** owner ke asli logos `resources/brand/` mein rakhe hain. `python3 scripts/make_icons.py` in se sab bana deta hai:
  - Android app icon (square + round + adaptive)
  - splash screen
  - PC/web icon aur Windows installer icon
  - app ke andar: dark mode mein main logo, light mode mein white logo, server mein gol logo
- **PC par poori screen:** dashboard ab daayein-baayein khaali jagah nahi chhorta. Ek line mein zyada cards aate hain.
- **Buttons fit:** Scripts / Thumbnails / Messages ke number aur icons har screen size par apni jagah rehte hain. Jagah kam ho to "Thumbs" / "Chat" jaise chhote naam ban jate hain.

---

## v8: Smooth keyboard, server list, app band ho tab bhi notifications, Windows ki patti

**Kya badla:**
- **Keyboard smooth:** typing box ab keyboard ke saath **har frame par** upar aata hai (jhatka nahi). Ye kaam app ka apna Android code karta hai (`resources/android/java/`). Phone ka status bar bhi app ke rang mein hai.
- **Server pehle list dikhata hai (phone):** Server kholne par seedha kisi ki chat nahi khulti. Pehle **# Channels / 👥 Friends** aate hain. Friends dabayein to saare friends, Channels dabayein to saare channels; phir jis par tap karein wahi chat khulti hai. PC par (badi screen) pichli chat saath khuli rehti hai kyunke list bhi saath nazar aati hai.
- **App band ho tab bhi notifications:**
  - **Android:** Firebase (FCM) ke zariye. Message, DM, nayi script/thumbnail, card ki chat, naya kaam assign, task tick/reject, friend request, aur deadline (shuru, 10 minute pehle, khatam) — sab ke alert phone par aate hain, chahe app band ho. Notification par tap karne se app usi jagah khulti hai.
  - **Windows:** window ka X dabane par app band nahi hoti, **tray** (ghadi ke paas) mein chalti rehti hai aur Windows notifications dikhati hai. Computer on hote hi khud (chupke se) chal jati hai. Poori tarah band: tray icon par right-click → **Band karein**.
- **Windows ki upar wali patti:** ab safed nahi. App ke rang mein hai (dark mein gehra neela, light mein safed) aur theme badalne par saath badalti hai, Discord ki tarah.

### v8 setup — app band hone par Android notifications (ek dafa, ~20 minute)

Ye na karein to bhi app chalegi: deadline alerts phone par phir bhi aate hain (app ek dafa khulne par schedule hote hain), aur Windows tray wala kaam bina setup chalta hai. Lekin **app band hone par message waghera ke alerts** ke liye ye zaroori hai.

**1) Supabase database update**
1. **SQL Editor** mein nayi `supabase/schema.sql` poori paste kar ke **Run** karein.
2. **Database → Extensions** mein `pg_net` aur `pg_cron` dono **on** hon. (Na hon to on kar ke schema.sql dobara Run karein.)

**2) Firebase project (muft)**
1. https://console.firebase.google.com par **Add project** → naam `KHR Production` → Create.
2. Project mein **Android** icon dabayein → package name **`com.khr.production`** (bilkul yahi) → Register.
3. **google-services.json** download karein.
4. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:
   - Name: `GOOGLE_SERVICES_JSON_BASE64`
   - Value: file ka base64. Windows PowerShell mein file wale folder mein ye chalayein, phir paste karein:
     ```
     [Convert]::ToBase64String([IO.File]::ReadAllBytes("google-services.json")) | Set-Clipboard
     ```
5. Firebase → ⚙ **Project settings → Service accounts → Generate new private key** → ek `.json` file download hogi. (Ye kisi ko na dein.)

**3) Supabase Edge Function (notification bhejne wala)**
1. Supabase → **Edge Functions → Deploy a new function → Via Editor**.
2. Naam: **`khr-push`**. Editor mein `supabase/functions/khr-push/index.ts` ka poora code paste karein → **Deploy**.
3. Function ki **Details / Settings** mein **"Verify JWT" / "Enforce JWT verification" OFF** karein → Save. (Function apna secret khud check karta hai.)
4. **Edge Functions → Secrets** mein do secrets add karein:
   - `FCM_SERVICE_ACCOUNT` = step 2.5 wali json file ka **poora text** (Notepad mein khol kar copy).
   - `KHR_PUSH_SECRET` = koi lamba secret, jaise `khr-9f3k2-x8qp-47zz-m1n0-lahore` (khud banayein).
5. **SQL Editor** mein ye chalayein (apna project URL aur wahi secret likhein):
   ```sql
   insert into khr_private.push_config (id, function_url, secret)
   values (1, 'https://APNA-PROJECT.supabase.co/functions/v1/khr-push', 'WAHI-LAMBA-SECRET')
   on conflict (id) do update set function_url = excluded.function_url, secret = excluded.secret;
   ```
   Project URL: **Project Settings → API** (wahi jo `VITE_SUPABASE_URL` hai).

**4) Nayi app**
1. Files GitHub par upload karein → Actions nayi APK bana dega (log mein "push notifications ON" likha aayega).
2. Phone par nayi APK install karein, kholein, login karein, **notifications Allow** karein.
3. Ghanti (🔔) kholein: **"✓ App band ho tab bhi … alerts aayenge"** likha ho to sab set hai.

**Test:** phone par app band kar dein (recent apps se swipe). Doosre account se is user ko DM bhejein — 1–2 second mein notification aana chahiye.

**Masla?**
- Notification nahi aaya: Supabase → Edge Functions → `khr-push` → **Logs** dekhein. `forbidden` = secret SQL aur function mein alag hai. `FCM error 403` = service account galat project ka hai.
- Kuch phones (Xiaomi, Oppo, Vivo, Infinix) band apps ko rokte hain: Settings → Apps → KHR Production → **Battery: No restrictions / Autostart on** karein.

---

## v9: Personal mode, videos (Gofile), profile, music, English, deadline extension, chat tools

**Update:** Supabase **SQL Editor** mein nayi `supabase/schema.sql` poori **Run** karein (purana data safe rehta hai; purani scripts / thumbnails khud videos mein aa jati hain). Phir files GitHub par upload karein.

- **Owner / Personal mode:** header mein 👑 Owner / 👤 Personal. Personal mein sirf aap ka apna kaam (jaise ek member), lekin team ke saare notifications aate rehte hain. Owner mein poori team ki management.
- **Ek channel = ek card:** member ke "Mere cards" mein har channel ka ek hi card, us mein us ke saare roles likhe hote hain. "Aaj" mein sirf un channels ke cards jin ki aaj baari hai.
- **Dropdowns:** Pending (har channel alag), Deadline expired, Completed (band, tap kar ke kholein), videos ki history (har din ek dropdown). History mein **date chunein** aur title se dhoondein.
- **Videos (scripts + thumbnails ki jagah):** card ke andar **Videos** button. "+ Nai video" mein title, script ka link (ya app mein likhi script), thumbnail (ImgBB), aur **video file**. Koi bhi baad mein **Edit** kar ke cheez jor sakta hai (misal: Script Writer script lagaye, Graphic Designer baad mein thumbnail). History mein video par tap karein to us ki script, thumbnail aur video khulti hai.
- **Video upload (Gofile.io):** phone / PC se MP4, MOV, MKV, WEBM (2 GB tak). App mein live progress bar: %, MB / MB aur **Cancel**. Ya Google Drive / Gofile / YouTube ka link paste karein. Server chat aur DM mein bhi 🎬 button se video bhej sakte hain. Video Supabase par nahi jati, sirf link save hota hai.
  - Owner ka Gofile token app mein laga hai, is liye saari videos owner ke Gofile account mein jati hain. Badalna ho to GitHub secret `VITE_GOFILE_TOKEN` add karein.
- **Views hata diye:** channels se daily views ka hissa nikal diya.
- **Deadline kai din ki:** channel ke role timeline mein "Deadline kis din" (usi din / +1 / +2 / +3 … din). Owner **"+ Kaam assign karein"** se kisi ko khaas kaam bhi de sakta hai: start date + waqt se deadline date + waqt tak.
- **Deadline extension:** deadline mein 30 minute ya kam rehne par (ya guzar jane ke baad) member **"⏳ Waqt barhayein"** dabaye, minutes aur wajah likhe. Owner ke "Aaj" par request aati hai: Approve = deadline barh jati hai, Reject = wahi rehti hai.
- **Server chat:** har message par Reply, Copy, Edit (apna), Forward (kisi channel ya DM mein), Pin 📌, Delete. Emoji button. Discord jaisa likhna: `# ` bara heading, `## ` / `### ` chhota heading, `**bold**`, `*italic*`, `~~kata~~`, `> quote`.
- **Profile:** DP lagate waqt **square crop** (zoom + khiskayein). Profile ke peeche **banner** (ImgBB). **About** khud likhein. Owner kisi ko **title** de sakta hai ("Best Editor (September)") — naam ke neeche 🏆 ke saath nazar aata hai. Profile card mein roles ki lambi list ki jagah sirf channels ke naam.
- **Apna theme:** Profile → 🎨 Theme aur background: ek rang, gradient (do rang + angle), ya apni tasveer (ImgBB) background mein; buttons ka khaas rang bhi.
- **Zabaan:** Profile → Zabaan / Language: Roman Urdu ya Full English. (Team ke likhe messages waise hi rehte hain. Phone par aane wale push notifications abhi Roman Urdu mein hain.)
- **Music:** header ka 🎵 button ya Profile → Music playlist. YouTube, YouTube Music, SoundCloud, Spotify, Vimeo ya mp3 ka link paste karein, playlist banayein, aur app ke andar hi chalayein (agla / pichla). Playlist sirf aap ko nazar aati hai.
- **Scrollbar** nazar nahi aata (scroll phir bhi chalta hai). Company chat wala notice DM se hata diya.

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
