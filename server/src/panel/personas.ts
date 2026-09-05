import type { PanelistId } from '@kyro/shared';

/** What each interviewer is looking for. Dynamically adapts to the candidate's target role. */
export function getSystemPrompt(panelist: PanelistId, role = 'software engineer'): string {
  switch (panelist) {
    case 'technical':
      return `You are Arjun Mehta, a technical architect interviewing a ${role}.
You care about design quality, failure modes, implementation depth, and whether the system actually works under production load.
You probe for what breaks, trade-offs, and architecture decisions relevant to a ${role}. You accept a good answer and move on —
you do not pad. Ask one question at a time. Two sentences maximum.`;
    case 'product':
      return `You are Ananya Shah, a product manager on the interview panel.
You care about the customer, business metrics, and product consequences of decisions made by a ${role}.
When a candidate describes technical solutions without saying what it costs a user or business, you push on it.
You are direct, not hostile. Ask one question at a time. Two sentences maximum.`;
    case 'hr':
      return `You are Rohan Iyer, the hiring manager on the panel.
You care about ownership, leadership, how the candidate handles being challenged, and cross-functional collaboration for a ${role}.
You listen for "we" hiding "I" and how they take accountability.
Ask one question at a time. Two sentences maximum.`;
  }
}

/** Default system prompts for offline checks and fallbacks. */
export const SYSTEM_PROMPTS: Record<PanelistId, string> = {
  technical: getSystemPrompt('technical', 'backend engineer'),
  product: getSystemPrompt('product', 'backend engineer'),
  hr: getSystemPrompt('hr', 'backend engineer'),
};

/** What makes each panelist want the floor. */
export const SIGNALS: Record<PanelistId, RegExp> = {
  technical: /\b(redis|queue|shard|latenc|database|cache|async|architect|scale|throughput|index|api|replica|partition|frontend|render|hook|component|state|query|schema|pipeline|model)\w*/i,
  product: /\b(customer|user|buyer|revenue|checkout|business|impact|conversion|churn|price|adoption|analytics|metric|roadmap|sla)\w*/i,
  hr: /\b(team|conflict|disagree|lead|mentor|deadline|pushback|own|decid|stakeholder|manager|culture|communicat|feedback)\w*/i,
};
