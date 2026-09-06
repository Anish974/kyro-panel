import { useState, useEffect } from 'react';

export default function BackToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    function handleScroll() {
      if (window.scrollY > 250) {
        setShow(true);
      } else {
        setShow(false);
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  function scrollToTop() {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  }

  if (!show) return null;

  return (
    <button
      type="button"
      onClick={scrollToTop}
      title="Back to top (T)"
      aria-label="Back to top"
      className="fixed bottom-6 right-6 z-40 w-11 h-11 rounded-full bg-white dark:bg-[#161920] border border-[#EBE6DF] dark:border-[#222631] text-[#181A20] dark:text-[#F9FAFB] shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 flex items-center justify-center transition-all cursor-pointer group"
    >
      <svg
        className="w-5 h-5 text-[#4B5565] dark:text-[#94A3B8] group-hover:text-[#181A20] dark:group-hover:text-white transition-colors"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
      </svg>
    </button>
  );
}
