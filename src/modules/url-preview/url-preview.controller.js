const urlPreviewService = require('./url-preview.service');

async function getUrlPreview(req, res, next) {
  try {
    const preview = await urlPreviewService.getUrlPreview({
      db: req.app.locals.db,
      rawUrl: req.query.url,
    });

    res.status(200).json(preview);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getUrlPreview,
};
