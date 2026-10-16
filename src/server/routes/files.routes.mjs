import {MAX_FILE_BYTES} from '../services/file.service.mjs';

export function registerFileRoutes(router, {services}) {
  // Raw body upload; the file name travels URL-encoded in X-File-Name.
  router.post('/api/claims/:id/files', async ctx => {
    const bytes = await ctx.raw(MAX_FILE_BYTES + 1);
    const result = services.files.upload(ctx.user.id, ctx.params.id, ctx.version, {
      name: decodeURIComponent(ctx.header('x-file-name') || 'evidence'),
      mime: ctx.header('content-type') || '',
      bytes,
    }, ctx.idempotencyKey);
    return {status: 201, body: result};
  });

  router.delete('/api/claims/:id/files/:fileId', ctx => ({
    body: {claim: services.files.remove(ctx.user.id, ctx.params.id, ctx.params.fileId, ctx.version)},
  }));

  router.get('/api/files/:fileId', ctx => ({
    file: services.files.download(ctx.user.id, ctx.params.fileId),
  }));
}
