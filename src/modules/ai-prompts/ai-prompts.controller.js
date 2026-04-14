const aiPromptsService = require('./ai-prompts.service');

async function listPrompts(req, res, next) {
  try {
    const data = await aiPromptsService.getAiPrompts({
      db: req.app.locals.db
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function reserveNextPromptId(req, res, next) {
  try {
    const data = await aiPromptsService.reserveNextPromptId({
      db: req.app.locals.db
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function createPrompt(req, res, next) {
  try {
    const data = await aiPromptsService.createPrompt({
      db: req.app.locals.db,
      actorUserId: req.auth.userId,
      payload: req.body || {}
    });

    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
}

async function updatePrompt(req, res, next) {
  try {
    const data = await aiPromptsService.updatePrompt({
      db: req.app.locals.db,
      promptId: String(req.params.id || ''),
      payload: req.body || {}
    });

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createPrompt,
  listPrompts,
  reserveNextPromptId,
  updatePrompt
};
