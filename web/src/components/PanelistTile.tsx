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
      className={`relative w-full flex-1 min-h-[70px] sm:min-h-[85px] lg:min-h-[95px] max-h-[145px] xl:max-h-[165px] rounded-xl sm:rounded-2xl overflow-hidden border transition-all duration-300 select-none cursor-pointer group ${
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
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/30 pointer-events-none" />

      {/* Top Right Status Badge */}
      <div className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 z-10">
        {speaking ? (
          <div className="flex items-center gap-1 bg-[#2563EB] text-white px-1.5 sm:px-2 py-0.5 rounded-full shadow-md text-[9px] sm:text-[10px] lg:text-xs font-bold tracking-wide">
            {/* Audio waveform equalizer */}
            <div className="flex items-center gap-[1.5px] sm:gap-[2px] h-2.5 sm:h-3">
              <span className="w-[1.5px] sm:w-[2px] h-1.5 sm:h-2 bg-white rounded-full animate-wave-1" />
              <span className="w-[1.5px] sm:w-[2px] h-2.5 sm:h-3 bg-white rounded-full animate-wave-2" />
              <span className="w-[1.5px] sm:w-[2px] h-3 sm:h-3.5 bg-white rounded-full animate-wave-3" />
              <span className="w-[1.5px] sm:w-[2px] h-1.5 sm:h-2 bg-white rounded-full animate-wave-4" />
            </div>
            <span className="truncate max-w-[60px] sm:max-w-none">Speaking</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 bg-black/60 backdrop-blur-md text-white px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] lg:text-[11px] font-medium border border-white/15 shadow-sm">
            {/* Muted mic icon */}
            <svg className="w-2.5 h-2.5 text-white/90 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span className="hidden xs:inline sm:inline">Listening</span>
          </div>
        )}
      </div>

      {/* Bottom Left Info Box */}
      <div className="absolute bottom-1.5 left-1.5 sm:bottom-2 sm:left-2 z-10 bg-black/65 sm:bg-white/95 sm:dark:bg-[#161920]/95 backdrop-blur-md rounded-lg sm:rounded-xl px-1.5 sm:px-2.5 py-0.5 sm:py-1 shadow-sm border border-white/20 sm:border-[#EBE6DF] sm:dark:border-[#222631] flex flex-col gap-0.5 max-w-[92%] sm:max-w-[85%]">
        <span className="text-[11px] sm:text-xs lg:text-sm font-bold text-white sm:text-gray-900 sm:dark:text-white tracking-tight leading-tight truncate">
          {panelist.name}
        </span>
        <span className="text-[9px] sm:text-[10px] lg:text-xs text-gray-300 sm:text-gray-500 sm:dark:text-gray-400 font-medium leading-tight truncate">
          {panelist.role}
        </span>
      </div>
    </div>
  );
}
