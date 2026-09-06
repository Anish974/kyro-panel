export function TableRowSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, idx) => (
        <tr key={idx} className="animate-pulse border-b border-[#EBE6DF]/60 dark:border-[#222631]/60">
          {/* Candidate */}
          <td className="px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-[#EBE6DF] dark:bg-[#222631] shrink-0" />
              <div className="flex flex-col gap-1.5 w-32">
                <div className="h-3.5 bg-[#EBE6DF] dark:bg-[#222631] rounded-md w-24" />
                <div className="h-2.5 bg-[#EBE6DF]/60 dark:bg-[#222631]/60 rounded-md w-16" />
              </div>
            </div>
          </td>

          {/* Role & Level */}
          <td className="px-6 py-4">
            <div className="flex flex-col gap-1.5 w-28">
              <div className="h-3.5 bg-[#EBE6DF] dark:bg-[#222631] rounded-md w-20" />
              <div className="h-3 bg-[#EBE6DF]/60 dark:bg-[#222631]/60 rounded-md w-14" />
            </div>
          </td>

          {/* Duration */}
          <td className="px-6 py-4">
            <div className="flex flex-col gap-1.5 w-16">
              <div className="h-3 bg-[#EBE6DF] dark:bg-[#222631] rounded-md w-12" />
              <div className="h-2.5 bg-[#EBE6DF]/60 dark:bg-[#222631]/60 rounded-md w-10" />
            </div>
          </td>

          {/* Verdicts columns */}
          <td className="px-6 py-4 text-center">
            <div className="h-3 bg-[#EBE6DF] dark:bg-[#222631] rounded-md w-12 mx-auto" />
          </td>
          <td className="px-6 py-4 text-center">
            <div className="h-3 bg-[#EBE6DF] dark:bg-[#222631] rounded-md w-12 mx-auto" />
          </td>
          <td className="px-6 py-4 text-center">
            <div className="h-3 bg-[#EBE6DF] dark:bg-[#222631] rounded-md w-12 mx-auto" />
          </td>

          {/* Dominant verdict */}
          <td className="px-6 py-4 text-center">
            <div className="h-6 bg-[#EBE6DF] dark:bg-[#222631] rounded-xl w-20 mx-auto" />
          </td>

          {/* Action button */}
          <td className="px-6 py-4 text-right">
            <div className="h-8 bg-[#EBE6DF] dark:bg-[#222631] rounded-xl w-20 ml-auto" />
          </td>
        </tr>
      ))}
    </>
  );
}

