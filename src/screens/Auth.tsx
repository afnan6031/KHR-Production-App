import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { errorText } from '../lib/utils';
import { Logo } from '../components/ui';

export function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'err' | 'ok'; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else {
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
      }
    } catch (err) {
      setMsg({ kind: 'err', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-brand">
        <Logo size={64} />
        <div>
          <h1>KHR Production</h1>
          <p className="muted m0">Channels, team, scripts aur performance, sab ek jagah.</p>
        </div>
      </div>

      <div className="seg" role="tablist">
        <button role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>
          Login
        </button>
        <button role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'on' : ''} onClick={() => setMode('signup')}>
          Naya account
        </button>
      </div>

      <form className="form panel" onSubmit={submit}>
        {mode === 'signup' && (
          <>
            <label className="f">
              Aap ka naam
              <input id="a-name" type="text" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rehan Ahmed" autoComplete="name" />
            </label>
            <label className="f">
              Aap ki ID <span className="h">WhatsApp number ya team ID, jis se owner aap ko pehchane</span>
              <input id="a-contact" type="text" required maxLength={80} value={contact} onChange={(e) => setContact(e.target.value)} placeholder="e.g. 0300-1234567" />
            </label>
            <label className="f">
              Kaam kya karte hain? <span className="h">Optional</span>
              <input id="a-note" type="text" maxLength={120} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Script writing aur editing" />
            </label>
          </>
        )}
        <label className="f">
          Email
          <input id="a-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" />
        </label>
        <label className="f">
          Password
          <input id="a-pass" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        </label>
        {msg && <div className={msg.kind === 'err' ? 'alert' : 'note'}>{msg.text}</div>}
        <button className="btn primary block" type="submit" disabled={busy}>
          {busy ? 'Ruk jayein…' : mode === 'login' ? 'Login' : 'Account banayein'}
        </button>
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
