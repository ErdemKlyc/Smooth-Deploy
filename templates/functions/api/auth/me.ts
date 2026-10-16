import { Env, json } from '../../_lib';

export const onRequestGet: PagesFunction<Env> = async ({ data }) => json({ email: (data.user as { email: string }).email });
