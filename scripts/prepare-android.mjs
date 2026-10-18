// Android project tayyar karta hai: platform add/sync, KHR icons + splash, version number, aur release signing.
// Use: npm run android:prepare   (pehle .env mein Supabase keys honi chahiye)
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

if (!existsSync('android')) run('npx cap add android');
run('npx cap sync android');

// 1) Icons, round icons, adaptive icon foreground, splash screens
cpSync('resources/android/res', 'android/app/src/main/res', { recursive: true, force: true });

// 2) Version (GitHub Actions run number se har build ka naya versionCode)
const gradlePath = 'android/app/build.gradle';
let g = readFileSync(gradlePath, 'utf8');
const versionCode = process.env.VERSION_CODE || '1';
const versionName = process.env.VERSION_NAME || '1.0.' + versionCode;
g = g.replace(/versionCode \d+/, `versionCode ${versionCode}`).replace(/versionName "[^"]*"/, `versionName "${versionName}"`);

// 3) Release signing — sirf jab keystore diya gaya ho
if (process.env.KHR_KEYSTORE && !g.includes('signingConfigs')) {
  g = g.replace(
    /android \{\n/,
    `android {
    signingConfigs {
        release {
            storeFile file(System.getenv("KHR_KEYSTORE"))
            storePassword System.getenv("KHR_KEYSTORE_PASSWORD")
            keyAlias System.getenv("KHR_KEY_ALIAS")
            keyPassword System.getenv("KHR_KEY_PASSWORD")
        }
    }
`
  );
  g = g.replace(/release \{\n(\s+)minifyEnabled false/, (m, sp) => `release {\n${sp}signingConfig signingConfigs.release\n${sp}minifyEnabled false`);
}
writeFileSync(gradlePath, g);

// 3b) Keyboard khule to app ka layout keyboard ke upar aaye
{
  const mp = 'android/app/src/main/AndroidManifest.xml';
  let m = readFileSync(mp, 'utf8');
  if (!m.includes('windowSoftInputMode')) {
    m = m.replace('<activity', '<activity\n            android:windowSoftInputMode="adjustResize"');
    writeFileSync(mp, m);
  }
}

// 3c) KHR native code: smooth keyboard + status bar ka rang (resources/android/java)
{
  const dir = 'android/app/src/main/java/com/khr/production';
  mkdirSync(dir, { recursive: true });
  cpSync('resources/android/java', dir, { recursive: true, force: true });
}

// 3d) Firebase (app band ho tab bhi notifications) — google-services.json GitHub secret se
{
  const b64 = process.env.GOOGLE_SERVICES_JSON_BASE64;
  if (b64) {
    writeFileSync('android/app/google-services.json', Buffer.from(b64, 'base64'));
    console.log('Firebase google-services.json added (push notifications ON)');
  } else if (existsSync('google-services.json')) {
    cpSync('google-services.json', 'android/app/google-services.json');
    console.log('Firebase google-services.json added from project folder');
  } else {
    console.log('WARNING: google-services.json nahi mila — app band hone par notifications nahi aayenge (README dekhein)');
  }
  const mp = 'android/app/src/main/AndroidManifest.xml';
  let m = readFileSync(mp, 'utf8');
  if (!m.includes('default_notification_icon')) {
    m = m.replace(
      '</application>',
      `    <meta-data android:name="com.google.firebase.messaging.default_notification_icon" android:resource="@drawable/ic_stat_khr" />
        <meta-data android:name="com.google.firebase.messaging.default_notification_color" android:resource="@color/khr_accent" />
        <meta-data android:name="com.google.firebase.messaging.default_notification_channel_id" android:value="khr_alerts" />
    </application>`
    );
  }
  if (!m.includes('POST_NOTIFICATIONS')) m = m.replace('</manifest>', '    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />\n</manifest>');
  writeFileSync(mp, m);
  writeFileSync('android/app/src/main/res/values/khr_colors.xml', '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="khr_accent">#E5383B</color>\n</resources>\n');
}

// 4) Internet permission (template mein hoti hai, phir bhi pakka kar lein)
const manPath = 'android/app/src/main/AndroidManifest.xml';
let man = readFileSync(manPath, 'utf8');
if (!man.includes('android.permission.INTERNET')) {
  man = man.replace('</manifest>', '    <uses-permission android:name="android.permission.INTERNET" />\n</manifest>');
  writeFileSync(manPath, man);
}

console.log(`Android ready: versionCode ${versionCode}, versionName ${versionName}, signing ${process.env.KHR_KEYSTORE ? 'release key' : 'none'}`);
