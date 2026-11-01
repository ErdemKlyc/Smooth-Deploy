import { useAuth } from './auth';

export default function UserMenu() {
  const { email, workspace, logout } = useAuth();
  return (
    <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <span style={{ color: '#94a3b8', fontSize: 13 }}>{workspace} · {email}</span>
      <button onClick={logout}>Sign out</button>
    </span>
  );
}
