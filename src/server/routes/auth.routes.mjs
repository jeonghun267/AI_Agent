import {AppError} from '../domain/errors.mjs';
import {cleanText} from '../domain/validation.mjs';

function tooMany() {
  return new AppError(429, 'too_many_attempts', '시도가 너무 많아요. 잠시 후 다시 시도하세요.');
}

export function registerAuthRoutes(router, {services, limits}) {
  router.post('/api/auth/signup', async ctx => {
    if (!limits.signup.hit(ctx.ip)) throw tooMany();
    const session = await services.auth.signup(await ctx.json());
    ctx.setSession(session);
    return {status: 201, body: {user: session.user, csrf: session.csrf}};
  }, {auth: false});

  router.post('/api/auth/login', async ctx => {
    const input = await ctx.json();
    const key = `${ctx.ip}:${cleanText(input.email, 200).toLowerCase()}`;
    if (!limits.login.hit(key)) throw tooMany();
    const session = await services.auth.login(input);
    limits.login.reset(key);
    ctx.setSession(session);
    return {body: {user: session.user, csrf: session.csrf}};
  }, {auth: false});

  router.post('/api/auth/logout', ctx => {
    services.auth.logout(ctx.sessionToken);
    ctx.clearSession();
    return {body: {ok: true}};
  });
}
