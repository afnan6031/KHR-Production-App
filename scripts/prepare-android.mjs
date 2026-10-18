// Android project tayyar karta hai: platform add/sync, KHR icons + splash, version number, aur release signing.
// Use: npm run android:prepare   (pehle .env mein Supabase keys honi chahiye)
import { execSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

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

// 4) Internet permission (template mein hoti hai, phir bhi pakka kar lein)
const manPath = 'android/app/src/main/AndroidManifest.xml';
let man = readFileSync(manPath, 'utf8');
if (!man.includes('android.permission.INTERNET')) {
  man = man.replace('</manifest>', '    <uses-permission android:name="android.permission.INTERNET" />\n</manifest>');
  writeFileSync(manPath, man);
}

console.log(`Android ready: versionCode ${versionCode}, versionName ${versionName}, signing ${process.env.KHR_KEYSTORE ? 'release key' : 'none'}`);
