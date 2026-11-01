import { FormEvent, useState } from 'react';
import { useAuth } from '../auth';
import '../auth.css';

// Set these two when you copy the file, to match the sign-in methods the developer chose.
const GOOGLE = true; // show "Continue with Google" (needs functions/api/auth/google*)
const EMAIL = true; // show the email + password form with sign-in / create-account (needs signup.ts + login.ts)

export default function Login() {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [workspace, setWorkspace] = useState('');
  const [error, setError] = useState(new URLSearchParams(location.search).get('auth_error') ?? '');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'login') await login(email, password);
      else await signup(email, password, workspace);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h2>__APP_TITLE__</h2>
        {error && <div className="login-error">{error}</div>}

        {GOOGLE && (
          <a className="login-google" href="/api/auth/google">
            Continue with Google
          </a>
        )}
        {GOOGLE && EMAIL && <div className="login-divider">or</div>}

        {EMAIL && (
          <form onSubmit={submit} className="login-form">
            {mode === 'signup' && (
              <label>Workspace name <span className="login-hint">(optional)</span>
                <input maxLength={80} value={workspace} onChange={(e) => setWorkspace(e.target.value)} />
              </label>
            )}
            <label>Email<input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label>Password
              <input type="password" required minLength={mode === 'signup' ? 10 : undefined}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            {mode === 'signup' && <span className="login-hint">At least 10 characters.</span>}
            <button type="submit" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
            <button type="button" className="login-link" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}>
              {mode === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
