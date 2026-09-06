import type { Claim, PanelistId, Verdict } from '@kyro/shared';

// How the domain's closed sets are drawn: verdicts, claim states, and the faces
// of the three panelists.
//
// These lived in three screens as private copies, and they had already drifted:
// a corroborated claim was #16A34A on the scorecard and #059669 in the room, so
// the same green badge was two different greens depending on which page you were
// on. Presentation, not domain — which is why it is here and not in @kyro/shared,
// where the server would be carrying hex codes it has no use for.

interface Badge {
  label: string;
  color: string;
  bg: string;
  border: string;
}

export const VERDICT: Record<Verdict, Badge> = {
  hire: { label: 'HIRE', color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0' },
  lean_hire: { label: 'LEAN HIRE', color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
  lean_no_hire: { label: 'LEAN NO HIRE', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  no_hire: { label: 'NO HIRE', color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
};

export const CLAIM: Record<Claim['status'], Badge> = {
  verified: { label: 'CORROBORATED', color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
  vague: { label: 'UNQUANTIFIED', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  contradicted: { label: 'CONTRADICTED', color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
  open: { label: 'TRACKED', color: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB' },
};

export const AVATARS: Record<PanelistId, string> = {
  technical: '/assets/arjun_mehta.jpg',
  product: '/assets/ananya_shah.jpg',
  hr: '/assets/rohan_iyer.jpg',
};
