import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { errorText } from '../lib/utils';
import { Fold, useToast } from './ui';

/**
 * v17: Account — registered Gmail (verify / badlein), birth date, phone, password.
 * Birth date aur phone alag private table mein hain (sirf apne ko nazar aate hain).
 */
export interface AccountInfo {
  email: string;
  birth: string;
  phone: string;
  verified: boolean;
  loaded: boolean;
  /** database mein v17 ki SQL nahi chali */
  oldDb: boolean;
  reload: () => Promise<void>;
}

export function useAccountInfo(): AccountInfo {
  const [email, setEmail] = useState('');
  const [birth, setBirth] = useState('');
  const [phone, setPhone] = useState('');
  const [verified, setVerified] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [oldDb, setOldDb] = useState(false);

  const reload = useCallback(async () => {
    try {
      const { data: u } = await supabase.auth.getUser();
      setEmail(u.user?.email || '');
    } catch {
      const { data: s } = await supabase.auth.getSession();
      setEmail(s.session?.user.email || '');
    }
    const r = await supabase.rpc('get_my_account');
    if (r.error) {
      setOldDb(true);
    } else {
      setOldDb(false);
      const row = (r.data as { birth_date: string | null; phone: string; gmail_verified: boolean }[] | null)?.[0];
      setBirth(row?.birth_date || '');
      setPhone(row?.phone || '');
      setVerified(!!row?.gmail_verified);
    }
    setLoaded(true);
  }, []);
  useEffect(() => { reload().catch(() => setLoaded(true)); }, [reload]);

  return { email, birth, phone, verified, loaded, oldDb, reload };
}

/** Profile ke upar: kis Gmail se register hai + verify / badlein */
export function GmailBox({ acc }: { acc: AccountInfo }) {
  const toast = useToast();
  const [step, setStep] = useState<'' | 'verify' | 'change'>('');
  const [sent, setSent] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const close = () => { setStep(''); setSent(false); setCode(''); setNewEmail(''); };

  async function sendCode() {
    setBusy(true);
    try {
      if (step === 'verify') {
        const { error } = await supabase.auth.signInWithOtp({ email: acc.email, options: { shouldCreateUser: false } });
        if (error) throw error;
      } else {
        const em = newEmail.trim();
        if (!/^\S+@\S+\.\S+$/.test(em)) throw new Error('Sahi email likhein.');
        const { error } = await supabase.auth.updateUser({ email: em });
        if (error) throw error;
      }
      setSent(true);
      toast('Code email par bhej diya gaya — inbox / Spam dekhein');
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    try {
      if (step === 'verify') {
        const { error } = await supabase.auth.verifyOtp({ email: acc.email, token: code.trim(), type: 'email' });
        if (error) throw error;
        const r = await supabase.rpc('mark_gmail_verified');
        if (r.error) throw r.error;
        if (!r.data) throw new Error('Verify nahi ho saka. Code dobara bhej kar try karein.');
      } else {
        const { error } = await supabase.auth.verifyOtp({ email: newEmail.trim(), token: code.trim(), type: 'email_change' });
        if (error) throw error;
        await supabase.rpc('mark_gmail_verified').then(() => undefined, () => undefined);
      }
      await acc.reload();
      toast(step === 'verify' ? '✓ Gmail verify ho gayi' : '✓ Gmail badal gayi');
      close();
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (!acc.loaded) return null;
  return (
    <div className="gmail-box">
      <div className="row between">
        <span>
          <small className="muted block">Registered Gmail</small>
          <b data-notr>{acc.email || '—'}</b>
        </span>
        {acc.oldDb ? null : acc.verified ? <span className="chip good sm">✓ Verified</span> : <span className="chip sm">Verify nahi</span>}
      </div>
      {acc.oldDb && <div className="alert">Database purana hai. Supabase SQL Editor mein <b>update-account.sql</b> Run karein, phir app dobara kholein.</div>}
      {!acc.oldDb && !acc.verified && !step && (
        <>
          <p className="muted tiny m0">Gmail verify karne se aap password bhoolne par apna account wapas le sakte hain.</p>
          <div className="row">
            <button type="button" className="btn sm primary" onClick={() => setStep('verify')}>Gmail verify karein</button>
            <button type="button" className="btn sm" onClick={() => setStep('change')}>Gmail badlein</button>
          </div>
        </>
      )}
      {!acc.oldDb && acc.verified && !step && (
        <div className="row"><button type="button" className="btn sm" onClick={() => setStep('change')}>Gmail badlein</button></div>
      )}

      {step === 'change' && !sent && (
        <label className="f">
          Nayi Gmail
          <input type="email" inputMode="email" autoComplete="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="name@gmail.com" />
        </label>
      )}
      {step === 'verify' && !sent && <p className="muted tiny m0">{`${acc.email} par 6 digit ka code bheja jayega.`}</p>}
      {step && sent && (
        <label className="f">
          Email mein aaya hua code
          <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={10} value={code} onChange={(e) => setCode(e.target.value.replace(/\s/g, ''))} placeholder="123456" />
        </label>
      )}
      {step && (
        <div className="row">
          {!sent
            ? <button type="button" className="btn sm primary" disabled={busy} onClick={sendCode}>{busy ? 'Ruk jayein…' : 'Code bhejein'}</button>
            : <button type="button" className="btn sm primary" disabled={busy || code.length < 4} onClick={confirm}>{busy ? 'Ruk jayein…' : 'Confirm karein'}</button>}
          {sent && <button type="button" className="btn sm" disabled={busy} onClick={sendCode}>Dobara bhejein</button>}
          <button type="button" className="btn sm" disabled={busy} onClick={close}>Band karein</button>
        </div>
      )}
    </div>
  );
}

/** "Account": birth date, phone, password */
export function AccountFold({ acc }: { acc: AccountInfo }) {
  const toast = useToast();
  const [birth, setBirth] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [cur, setCur] = useState('');
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  useEffect(() => { setBirth(acc.birth); setPhone(acc.phone); }, [acc.birth, acc.phone]);

  async function saveInfo() {
    setSaving(true);
    try {
      const { error } = await supabase.rpc('save_my_account', { p_birth: birth || null, p_phone: phone.trim() });
      if (error) throw error;
      await acc.reload();
      toast('Account save ho gaya');
    } catch (e) {
      toast(errorText(e));
    } finally {
      setSaving(false);
    }
  }

  async function changePassword() {
    if (p1.length < 6) return toast('Password kam az kam 6 characters ka rakhein.');
    if (p1 !== p2) return toast('Dono password ek jaise nahi hain.');
    if (!acc.email) return toast('Email nahi mili. Dobara login karein.');
    setPwBusy(true);
    try {
      const chk = await supabase.auth.signInWithPassword({ email: acc.email, password: cur });
      if (chk.error) throw new Error('Mojooda password ghalat hai.');
      const { error } = await supabase.auth.updateUser({ password: p1 });
      if (error) throw error;
      setCur(''); setP1(''); setP2('');
      toast('Password badal gaya');
    } catch (e) {
      toast(errorText(e));
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <Fold id="prof-account" title={<b>👤 Account</b>} defaultOpen={false}>
      <p className="muted tiny m0">Ye maloomat sirf aap ko nazar aati hain. Team ke baaqi log nahi dekh sakte.</p>
      <label className="f">
        Birth date
        <input type="date" value={birth} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setBirth(e.target.value)} disabled={acc.oldDb} />
      </label>
      <label className="f">
        Phone number
        <input type="tel" inputMode="tel" autoComplete="tel" maxLength={30} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0300-1234567" disabled={acc.oldDb} />
      </label>
      <button type="button" className="btn primary block" disabled={saving || acc.oldDb} onClick={saveInfo}>{saving ? 'Save ho raha hai…' : 'Account save karein'}</button>

      <h3 className="m0">Password badlein</h3>
      <label className="f">
        Mojooda password
        <input type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
      </label>
      <label className="f">
        Naya password
        <input type="password" autoComplete="new-password" minLength={6} value={p1} onChange={(e) => setP1(e.target.value)} />
      </label>
      <label className="f">
        Naya password dobara
        <input type="password" autoComplete="new-password" minLength={6} value={p2} onChange={(e) => setP2(e.target.value)} />
      </label>
      <button type="button" className="btn block" disabled={pwBusy || !cur || !p1} onClick={changePassword}>{pwBusy ? 'Ruk jayein…' : 'Password badlein'}</button>
      <p className="muted tiny m0">Password yaad na ho to logout kar ke login screen par "Password bhool gaye?" dabayein — Gmail par code aayega.</p>
    </Fold>
  );
}
