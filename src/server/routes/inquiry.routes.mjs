// Inquiry drafts, seller replies and actual receipts for one claim.
export function registerInquiryRoutes(router, {services}) {
  router.get('/api/claims/:id/draft-template', ctx => ({
    body: services.drafts.template(ctx.user.id, ctx.params.id),
  }));

  router.post('/api/claims/:id/drafts', async ctx => ({
    status: 201,
    body: {claim: services.drafts.save(ctx.user.id, ctx.params.id, ctx.version, await ctx.json(), ctx.idempotencyKey)},
  }));

  router.post('/api/claims/:id/drafts/submit', async ctx => ({
    body: {claim: services.drafts.submit(ctx.user.id, ctx.params.id, ctx.version, await ctx.json(), ctx.idempotencyKey)},
  }));

  router.post('/api/claims/:id/replies', async ctx => ({
    body: {claim: services.replies.record(ctx.user.id, ctx.params.id, ctx.version, await ctx.json())},
  }));

  router.post('/api/claims/:id/receipts', async ctx => ({
    status: 201,
    body: services.receipts.record(ctx.user.id, ctx.params.id, ctx.version, await ctx.json(), ctx.idempotencyKey),
  }));
}
