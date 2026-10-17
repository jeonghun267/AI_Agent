import {MAX_FILE_BYTES} from '../services/file.service.mjs';

// AI suggestions. Responses are previews; the user saves through other routes.
export function registerAiRoutes(router, {services}) {
  const {ai} = services;

  router.post('/api/ai/translate-issue', async ctx => ({
    body: await ai.translateIssue(ctx.user, await ctx.json()),
  }));

  // Raw body like a file upload; the file name travels URL-encoded in X-File-Name.
  router.post('/api/ai/extract', async ctx => ({
    body: await ai.extractDocument(ctx.user, {
      name: decodeURIComponent(ctx.header('x-file-name') || 'document'),
      mime: ctx.header('content-type') || '',
      bytes: await ctx.raw(MAX_FILE_BYTES + 1),
    }),
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
