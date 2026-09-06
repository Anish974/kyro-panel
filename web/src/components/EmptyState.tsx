interface Props {
  icon?: string;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}

export default function EmptyState({
  icon = '🔍',
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
}: Props) {
  return (
    <div className="py-12 px-6 text-center flex flex-col items-center justify-center max-w-md mx-auto select-none animate-in fade-in duration-300">
      <div className="w-14 h-14 rounded-2xl bg-[#F4F1EA] dark:bg-[#1E232D] border border-[#E6DAC8] dark:border-[#2D333F] flex items-center justify-center text-2xl mb-4 shadow-2xs">
        {icon}
      </div>
      <h3 className="font-display text-lg font-bold text-[#181A20] dark:text-[#F9FAFB]">
        {title}
      </h3>
      <p className="mt-1.5 text-xs sm:text-sm text-[#4B5565] dark:text-[#94A3B8] leading-relaxed">
        {description}
      </p>

      {(actionLabel || secondaryActionLabel) && (
        <div className="mt-6 flex items-center gap-3">
          {secondaryActionLabel && onSecondaryAction && (
            <button
              type="button"
              onClick={onSecondaryAction}
              className="h-9 px-4 rounded-xl border border-[#EBE6DF] dark:border-[#222631] bg-white dark:bg-[#161920] text-xs font-bold text-[#4B5565] dark:text-[#94A3B8] hover:bg-gray-50 dark:hover:bg-[#1E232D] transition-colors cursor-pointer"
            >
              {secondaryActionLabel}
            </button>
          )}
          {actionLabel && onAction && (
            <button
              type="button"
              onClick={onAction}
              className="h-9 px-4 rounded-xl bg-[#181A20] dark:bg-[#F9FAFB] text-white dark:text-[#0F1115] text-xs font-bold hover:bg-black dark:hover:bg-white transition-colors cursor-pointer shadow-2xs"
            >
              {actionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
