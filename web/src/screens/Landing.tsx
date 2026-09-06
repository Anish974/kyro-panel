import { useState } from 'react';

// The front door. Two audiences arrive here — someone hiring, and someone who
// wants to practise — and they need different things, so the page says what
// this is and then asks which one you are rather than guessing.

interface Props {
  onCompany: () => void;
  onCandidate: () => void;
}

// Served from web/public, so the same files the README points at are the ones
// the page loads. Two copies of a screenshot drift the moment the UI changes.
const SHOTS = [
  {
    src: '/screenshots/room.png',
    title: 'The room',
    caption: 'Three interviewers, live captions, and whoever currently holds the floor.',
  },
  {
    src: '/screenshots/scorecard.png',
    title: 'The scorecard',
    caption: 'Three separate verdicts, each quoting you with a timestamp.',
  },
] as const;

export default function Landing({ onCompany, onCandidate }: Props) {
  // A screenshot that has not been captured yet must not leave a broken image
  // on the front page — drop the figure instead and let the section close up.
  const [missing, setMissing] = useState<readonly string[]>([]);
  const shots = SHOTS.filter(s => !missing.includes(s.src));
  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#181A20]">
      <header className="max-w-[1080px] mx-auto px-6 pt-10 pb-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <img src="/favicon.png" alt="Kyro Panel Logo" className="w-7 h-7 rounded-lg object-contain" />
          <span className="font-display font-extrabold text-xl">Kyro Panel</span>
        </div>
        <button
          onClick={onCompany}
          className="text-sm font-bold text-[#4B5565] hover:text-[#181A20] transition-colors cursor-pointer"
        >
          For hiring teams
        </button>
      </header>

      <main className="max-w-[1080px] mx-auto px-6">
        <section className="pt-10 pb-14 text-center">
          <h1 className="font-display text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.05]">
            Three interviewers.
            <br />
            One call. They argue.
          </h1>
          <p className="mt-6 text-lg text-[#4B5565] max-w-2xl mx-auto">
            A technical architect, a product manager and a hiring manager share one
            memory of your interview. After every answer they bid for the floor, and
            whoever cares most asks next. At the end you get three verdicts —
            <strong className="text-[#181A20]"> never averaged into one number.</strong>
          </p>

          <div className="mt-9 flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={onCandidate}
              className="h-12 px-7 rounded-xl bg-[#181A20] text-white font-bold text-sm hover:bg-black transition-colors cursor-pointer"
            >
              Get started
            </button>
            <button
              onClick={onCompany}
              className="h-12 px-7 rounded-xl bg-white border border-[#EBE6DF] font-bold text-sm text-[#181A20] hover:bg-gray-50 transition-colors cursor-pointer"
            >
              I'm hiring
            </button>
          </div>
          <p className="mt-4 text-xs text-[#8C93A3]">
            Have an invite link from a company? Open that instead — it already knows your role.
          </p>
        </section>

        <section className="grid gap-8 sm:grid-cols-2 pb-16">
          {shots.map(shot => (
            <figure key={shot.src}>
              <img
                src={shot.src}
                alt={shot.title}
                loading="lazy"
                onError={() => setMissing(m => (m.includes(shot.src) ? m : [...m, shot.src]))}
                className="w-full rounded-2xl border border-[#EBE6DF] shadow-sm bg-white"
              />
              <figcaption className="mt-3">
                <span className="font-bold text-sm">{shot.title}</span>
                <span className="block text-sm text-[#4B5565]">{shot.caption}</span>
              </figcaption>
            </figure>
          ))}
        </section>
      </main>

      <footer className="border-t border-[#EBE6DF] py-8 text-center text-xs text-[#8C93A3] font-mono">
        Kyro Panel &nbsp;•&nbsp; every interviewer here is AI, and says so in the room
      </footer>
    </div>
  );
}
