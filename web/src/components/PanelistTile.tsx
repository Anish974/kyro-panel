import type { Bid, Panelist } from '@kyro/shared';

interface Props {
  panelist: Panelist;
  bid?: Bid;
  speaking: boolean;
  avatarUrl: string;
  onSelect?: () => void;
}

export default function PanelistTile({ panelist, speaking, avatarUrl, onSelect }: Props) {
  return (
    <div
      onClick={onSelect}
      className={`relative w-full flex-1 min-h-[85px] sm:min-h-[95px] max-h-[145px] xl:max-h-[165px] rounded-2xl overflow-hidden border transition-all duration-300 select-none cursor-pointer group ${
        speaking
          ? 'border-[#2563EB] ring-2 ring-[#2563EB]/40 shadow-lg shadow-blue-500/20'
          : 'border-[#EBE6DF] dark:border-[#222631] hover:border-[#CBB9A4] dark:hover:border-gray-600 shadow-xs hover:shadow-md'
      }`}
    >
      {/* Background Avatar / Video Stream */}
      <img
        src={avatarUrl}
        alt={panelist.name}
        className="absolute inset-0 w-full h-full object-cover object-center transform group-hover:scale-[1.02] transition-transform duration-500"
      />

      {/* Subtle vignette gradient for high contrast */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none" />

      {/* Top Right Status Badge */}
      <div className="absolute top-2 right-2 sm:top-2.5 sm:right-2.5 z-10">
        {speaking ? (
          <div className="flex items-center gap-1.5 bg-[#2563EB] text-white px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full shadow-md text-[10px] sm:text-xs font-bold tracking-wide">
            {/* Audio waveform equalizer */}
            <div className="flex items-center gap-[2px] h-3">
              <span className="w-[2px] h-2 bg-white rounded-full animate-wave-1" />
              <span className="w-[2px] h-3 bg-white rounded-full animate-wave-2" />
              <span className="w-[2px] h-3.5 bg-white rounded-full animate-wave-3" />
              <span className="w-[2px] h-1.5 bg-white rounded-full animate-wave-4" />
              <span className="w-[2px] h-3 bg-white rounded-full animate-wave-5" />
            </div>
            <span>Speaking...</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-md text-white px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-[11px] font-medium border border-white/15 shadow-sm">
            {/* Muted mic icon */}
            <svg className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white/90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span>Listening</span>
          </div>
        )}
      </div>

      {/* Bottom Left Info Box */}
      <div className="absolute bottom-2 left-2 sm:bottom-2.5 sm:left-2.5 z-10 bg-white/95 dark:bg-[#161920]/95 backdrop-blur-md rounded-xl px-2.5 sm:px-3 py-1 sm:py-1.5 shadow-sm border border-[#EBE6DF] dark:border-[#222631] flex flex-col gap-0.5 max-w-[85%]">
        <span className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white tracking-tight leading-snug">{panelist.name}</span>
        <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 font-medium leading-snug">{panelist.role}</span>
        <div className="flex items-center gap-1 mt-0.5">
          <svg className="w-2.5 h-2.5 text-[#2563EB] dark:text-blue-400" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
          <span className="text-[10px] font-bold text-[#2563EB] dark:text-blue-400">AI Interviewer</span>
        </div>
      </div>
    </div>
  );
}
