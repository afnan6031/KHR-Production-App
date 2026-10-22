/**
 * v16: koi bhi file (misal voiceover .wav) device mein save karna.
 * - PC / web: seedha download
 * - Android app: phone ke Documents/KHR folder mein, aur share sheet (WhatsApp / Drive / Files) bhi khulti hai
 */
import { Capacitor } from '@capacitor/core';

function blobToBase64(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error('File parhi nahi ja saki'));
    r.readAsDataURL(b);
  });
}

/** wapas: user ko dikhane wala chhota sa message */
export async function saveBlobFile(blob: Blob, name: string): Promise<string> {
  const safe = name.replace(/[\\/:*?"<>|]+/g, '_');
  if (!Capacitor.isNativePlatform()) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = safe;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    return 'Download ho gaya: ' + safe;
  }
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
  const data = await blobToBase64(blob);
  let saved = '';
  try {
    await Filesystem.writeFile({ path: 'KHR/' + safe, data, directory: Directory.Documents, recursive: true });
    saved = 'Phone ke Documents/KHR folder mein save: ' + safe;
  } catch {
    /* purane Android par ijazat nahi — share se save karein */
  }
  try {
    const tmp = await Filesystem.writeFile({ path: safe, data, directory: Directory.Cache });
    await Share.share({ title: safe, files: [tmp.uri], dialogTitle: 'Voiceover save / bhejein' });
  } catch {
    if (!saved) throw new Error('File save nahi hui. Phone mein jagah check karein.');
  }
  return saved || 'Share se save kar lein: ' + safe;
}
