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

  // Public: the link is often opened in a browser that is not signed in.
  router.post('/api/auth/verify', async ctx => {
    if (!limits.links.hit(ctx.ip)) throw tooMany();
    const {token} = await ctx.json();
    services.auth.verifyEmail(token);
    return {body: {ok: true}};
  }, {auth: false});

  router.post('/api/auth/verify/resend', ctx => {
    if (!limits.resendVerification.hit(ctx.user.id)) throw tooMany();
    return {body: services.auth.resendVerification(ctx.user.id)};
  });

  // Answers the same for every address. The limits count attempts, not
  // accounts, so a 429 does not reveal anything either.
  router.post('/api/auth/forgot', async ctx => {
    const {email} = await ctx.json();
    const byClient = limits.resetClient.hit(ctx.ip);
    const byAddress = limits.resetEmail.hit(cleanText(email, 200).toLowerCase());
    if (!byClient || !byAddress) throw tooMany();
    services.auth.requestPasswordReset(email);
    return {body: {ok: true}};
  }, {auth: false});

  // Ends every session of the account, and this browser's own session too.
  router.post('/api/auth/reset', async ctx => {
    if (!limits.links.hit(ctx.ip)) throw tooMany();
    const {token, password} = await ctx.json();
    await services.auth.resetPassword(token, password);
    services.auth.logout(ctx.sessionToken);
    ctx.clearSession();
    return {body: {ok: true}};
  }, {auth: false});
}
