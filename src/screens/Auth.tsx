import { useState, type FormEvent } from 'react';
import { authHold, releaseAuthHold, supabase } from '../lib/supabase';
import { errorText } from '../lib/utils';
import { Logo, useToast } from '../components/ui';

type Mode = 'login' | 'signup' | 'forgot' | 'findid';

export function AuthScreen() {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'err' | 'ok'; text: string } | null>(null);
  // "Password bhool gaye": pehle email par code bhejo, phir code + naya password
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newPass2, setNewPass2] = useState('');
  // "ID bhool gaye"
  const [hint, setHint] = useState<string | null | undefined>(undefined);

  const go = (m: Mode) => { setMode(m); setMsg(null); setHint(undefined); setCodeSent(false); setCode(''); setNewPass(''); setNewPass2(''); };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else if (mode === 'signup') {
        if (!name.trim() || !contact.trim()) throw new Error('Naam aur ID dono likhein.');
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: name.trim(), contact: contact.trim(), note: note.trim() } }
        });
        if (error) throw error;
        if (!data.session) {
          setMsg({ kind: 'ok', text: 'Account ban gaya. Apni email mein confirmation link dabayein, phir yahan login karein.' });
          setMode('login');
        }
      } else if (mode === 'forgot') {
        if (!codeSent) {
          const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
          if (error) throw error;
          setCodeSent(true);
          setMsg({ kind: 'ok', text: 'Agar ye email registered hai to us par code bhej diya gaya hai. Inbox (aur Spam) check karein, phir code aur naya password likhein.' });
        } else {
          if (newPass.length < 6) throw new Error('Password kam az kam 6 characters ka rakhein.');
          if (newPass !== newPass2) throw new Error('Dono password ek jaise nahi hain.');
          authHold.on = true; // code lagte hi login ho jata hai — password lagne tak dashboard par na jayein
          try {
            const v = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'recovery' });
            if (v.error) throw v.error;
            const u = await supabase.auth.updateUser({ password: newPass });
            if (u.error) throw u.error;
            // email ke code se kholi gayi, yani ye Gmail asli hai
            await supabase.rpc('mark_gmail_verified').then(() => undefined, () => undefined);
            toast('Password badal gaya');
          } catch (err) {
            await supabase.auth.signOut().catch(() => undefined);
            throw err;
          } finally {
            releaseAuthHold();
          }
        }
      } else if (mode === 'findid') {
        const { data, error } = await supabase.rpc('login_hint', { p_name: name.trim(), p_contact: contact.trim() });
        if (error) throw error;
        setHint((data as string | null) || null);
      }
    } catch (err) {
      setMsg({ kind: 'err', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  const title = mode === 'forgot' ? 'Password bhool gaye' : mode === 'findid' ? 'ID / email bhool gaye' : '';

  return (
    <div className="auth">
      <div className="auth-brand">
        <Logo size={64} />
        <div>
          <h1>KHR Production</h1>
          <p className="muted m0">Channels, team, scripts aur performance, sab ek jagah.</p>
        </div>
      </div>

      {(mode === 'login' || mode === 'signup') && (
        <div className="seg" role="tablist">
          <button role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'on' : ''} onClick={() => go('login')}>
            Login
          </button>
          <button role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'on' : ''} onClick={() => go('signup')}>
            Naya account
          </button>
        </div>
      )}

      <form className="form panel" onSubmit={submit}>
        {title && <h2 className="m0">{title}</h2>}

        {(mode === 'signup' || mode === 'findid') && (
          <>
            <label className="f">
              {mode === 'signup' ? 'Aap ka naam' : 'Signup par likha hua naam'}
              <input id="a-name" type="text" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rehan Ahmed" autoComplete="name" />
            </label>
            <label className="f">
              {mode === 'signup' ? 'Aap ki ID' : 'Signup par likhi hui ID'} <span className="h">WhatsApp number ya team ID, jis se owner aap ko pehchane</span>
              <input id="a-contact" type="text" required maxLength={80} value={contact} onChange={(e) => setContact(e.target.value)} placeholder="e.g. 0300-1234567" />
            </label>
          </>
        )}
        {mode === 'signup' && (
          <label className="f">
            Kaam kya karte hain? <span className="h">Optional</span>
            <input id="a-note" type="text" maxLength={120} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Script writing aur editing" />
          </label>
        )}

        {(mode === 'login' || mode === 'signup' || mode === 'forgot') && (
          <label className="f">
            Email {mode === 'signup' && <span className="h">Apni asli Gmail likhein — password bhoolne par isi par code aayega</span>}
            <input id="a-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" placeholder="e.g. name@gmail.com" readOnly={mode === 'forgot' && codeSent} />
          </label>
        )}

        {(mode === 'login' || mode === 'signup') && (
          <label className="f">
            Password
            <input id="a-pass" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </label>
        )}

        {mode === 'forgot' && codeSent && (
          <>
            <label className="f">
              Email mein aaya hua code
              <input id="a-code" type="text" required inputMode="numeric" autoComplete="one-time-code" maxLength={10} value={code} onChange={(e) => setCode(e.target.value.replace(/\s/g, ''))} placeholder="123456" />
            </label>
            <label className="f">
              Naya password
              <input id="a-newpass" type="password" required minLength={6} value={newPass} onChange={(e) => setNewPass(e.target.value)} autoComplete="new-password" />
            </label>
            <label className="f">
              Naya password dobara
              <input id="a-newpass2" type="password" required minLength={6} value={newPass2} onChange={(e) => setNewPass2(e.target.value)} autoComplete="new-password" />
            </label>
          </>
        )}

        {mode === 'findid' && hint !== undefined && (
          hint
            ? <div className="note"><span>Aap ki registered email:</span> <b data-notr>{hint}</b><br /><span>Is email se login karein. Password bhi yaad na ho to "Password bhool gaye?" dabayein.</span></div>
            : <div className="alert">Is naam aur ID se koi account nahi mila. Naam aur ID bilkul wahi likhein jo signup par likhi thi, ya owner se poochein.</div>
        )}

        {msg && <div className={msg.kind === 'err' ? 'alert' : 'note'}>{msg.text}</div>}

        <button className="btn primary block" type="submit" disabled={busy}>
          {busy
            ? 'Ruk jayein…'
            : mode === 'login' ? 'Login'
            : mode === 'signup' ? 'Account banayein'
            : mode === 'findid' ? 'Email dhoondein'
            : codeSent ? 'Password badlein' : 'Email par code bhejein'}
        </button>

        {mode === 'forgot' && codeSent && (
          <button type="button" className="linkbtn" onClick={() => { setCodeSent(false); setMsg(null); setCode(''); }} disabled={busy}>Code dobara bhejein</button>
        )}

        {mode === 'login' && (
          <div className="row between">
            <button type="button" className="linkbtn" onClick={() => go('forgot')}>Password bhool gaye?</button>
            <button type="button" className="linkbtn" onClick={() => go('findid')}>ID / email bhool gaye?</button>
          </div>
        )}
        {mode === 'findid' && hint !== undefined && hint && (
          <div className="row between">
            <button type="button" className="linkbtn" onClick={() => go('login')}>Login par jayein</button>
            <button type="button" className="linkbtn" onClick={() => go('forgot')}>Password bhool gaye?</button>
          </div>
        )}
        {(mode === 'forgot' || mode === 'findid') && (
          <button type="button" className="linkbtn" onClick={() => go('login')}>← Wapas login par</button>
        )}
        {mode === 'signup' && <p className="muted tiny m0">Account banne ke baad owner aap ki request approve karega, phir dashboard khulega.</p>}
      </form>
    </div>
  );
}

export function NotConfigured() {
  return (
    <div className="auth">
      <div className="auth-brand">
        <Logo size={64} />
        <h1>KHR Production</h1>
      </div>
      <div className="alert">
        App abhi Supabase se connect nahi. Build karte waqt <b>VITE_SUPABASE_URL</b> aur <b>VITE_SUPABASE_ANON_KEY</b> set karein (setup guide dekhein).
      </div>
    </div>
  );
}
