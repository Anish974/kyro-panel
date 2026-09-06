import { Router } from 'express';
import { InterviewError, create, find, list, markStarted } from '../panel/interviews.js';

// The company schedules an interview and gets a code; the candidate's link
// carries that code and resolves back to the role and level already chosen for
// them. See panel/interviews.ts for why the candidate no longer picks either.

const router = Router();

router.get('/interviews', async (_req, res) => res.json(await list()));

router.post('/interviews', async (req, res) => {
  try {
    res.status(201).json(await create(req.body ?? {}));
  } catch (err) {
    if (err instanceof InterviewError) return res.status(400).json({ error: err.message });
    throw err;
  }
});

router.get('/interviews/:code', async (req, res) => {
  const interview = await find(req.params.code);
  // Say nothing about which part was wrong: a code is the only thing standing
  // between a stranger and a candidate's name.
  if (!interview) return res.status(404).json({ error: 'no interview for that code' });
  res.json(interview);
});

/** The candidate opened the room. Idempotent — a refresh must not reset it. */
router.post('/interviews/:code/start', async (req, res) => {
  const interview = await markStarted(req.params.code);
  if (!interview) return res.status(404).json({ error: 'no interview for that code' });
  res.json(interview);
});

export default router;
