import { Router } from 'express';
import { InterviewError, create, find, list, markStarted } from '../panel/interviews.js';
import { recruiterId, requireRecruiter } from './auth.js';

// The company schedules an interview and gets a code; the candidate's link
// carries that code and resolves back to the role and level already chosen for
// them. See panel/interviews.ts for why the candidate no longer picks either.
//
// Who has to be signed in, and who must not be:
//
//   scheduling an assessment   recruiter — it is their candidate, their bar,
//                              and it lands in their portal
//   listing the schedule       recruiter — scoped to what they own
//   starting a mock            nobody — practice with a sign-up wall in front
//                              of it is practice nobody does
//   resolving a code           nobody — the candidate holding the link has no
//                              account, and the code is the credential

const router = Router();

router.get('/interviews', requireRecruiter, async (_req, res) => {
  res.json(await list(recruiterId(res)));
});

router.post('/interviews', async (req, res, next) => {
  const body = req.body ?? {};

  // A mock belongs to the candidate who started it, so it needs no account —
  // and it gets no owner, which is what keeps it out of every company portal.
  if (body.mock === true) {
    try {
      return res.status(201).json(await create({ ...body, ownerId: null }));
    } catch (err) {
      if (err instanceof InterviewError) return res.status(400).json({ error: err.message });
      throw err;
    }
  }

  // A real assessment is a recruiter's, so it takes the owner from the verified
  // token and never from the body — a client-supplied owner_id would let anyone
  // file an interview into someone else's portal.
  requireRecruiter(req, res, async () => {
    try {
      res.status(201).json(await create({ ...body, mock: false, ownerId: recruiterId(res) }));
    } catch (err) {
      if (err instanceof InterviewError) return res.status(400).json({ error: err.message });
      next(err);
    }
  });
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
