import type { SessionUser } from '../../_auth';
import { Env, json } from '../../_lib';

export const onRequestGet: PagesFunction<Env> = async ({ data }) => {
  const u = data.user as SessionUser;
  return json({ email: u.email, workspace: u.tenant_name, role: u.role });
};
