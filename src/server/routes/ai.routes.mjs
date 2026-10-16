// AI suggestions. Responses are previews; the user saves through other routes.
export function registerAiRoutes(router, {services}) {
  const {ai} = services;

  router.post('/api/ai/translate-issue', async ctx => ({
    body: await ai.translateIssue(ctx.user, await ctx.json()),
  }));

  router.post('/api/claims/:id/ai/draft', async ctx => ({
    body: await ai.draft(ctx.user, ctx.params.id),
  }));

  router.post('/api/claims/:id/ai/analyze-reply', async ctx => ({
    body: await ai.analyzeReply(ctx.user, ctx.params.id, await ctx.json()),
  }));

  router.post('/api/claims/:id/ai/extract', async ctx => ({
    body: await ai.extract(ctx.user, ctx.params.id, await ctx.json()),
  }));
}
