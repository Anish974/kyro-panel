import { useState } from 'react';

interface Props {
  onLogin: (email: string) => void;
}

export default function Login({ onLogin }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your email or Gmail address');
      return;
    }
    if (!password) {
      setError('Please enter your password');
      return;
    }
    setError('');
    onLogin(email.trim());
  };

  const handleQuickDemo = () => {
    setEmail('candidate@gmail.com');
    setPassword('demo12345');
    onLogin('candidate@gmail.com');
  };

  return (
    <div className="min-h-screen w-full bg-[#FAF9F6] flex flex-col justify-center items-center px-4 py-12 select-none">
      {/* Top Brand Tag / Logo */}
      <div className="w-full max-w-md mb-8 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#F4F1EA] border border-[#EBE6DF] text-xs font-mono text-[#4B5565] uppercase tracking-wider mb-4">
          <span className="w-2 h-2 rounded-full bg-[#059669] animate-pulse"></span>
          AI-Powered Multi-Panel Platform
        </div>
        
        {/* Prominent Headline / Topic */}
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-[#181A20] font-display">
          Kyro Panel
        </h1>
        <p className="mt-2 text-base text-[#4B5565] font-sans">
          Sign in with any Gmail and password to enter the interview room
        </p>
      </div>

      {/* Login Card */}
      <div className="w-full max-w-md bg-[#FFFFFF] rounded-2xl border border-[#EBE6DF] shadow-sm p-8 sm:p-10">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-3 text-sm text-[#EF4444] bg-[#FEF2F2] border border-[#FEE2E2] rounded-xl flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wider text-[#4B5565] mb-2 font-mono">
              Gmail / Email Address
            </label>
            <div className="relative">
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="yourname@gmail.com"
                className="w-full px-4 py-3 rounded-xl bg-[#FAF9F6] border border-[#EBE6DF] text-[#181A20] placeholder-[#8C93A3] text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent transition-all"
                autoFocus
              />
              <div className="absolute right-3.5 top-3.5 text-[#8C93A3] pointer-events-none">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wider text-[#4B5565] font-mono">
                Password
              </label>
            </div>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter any password"
                className="w-full px-4 py-3 rounded-xl bg-[#FAF9F6] border border-[#EBE6DF] text-[#181A20] placeholder-[#8C93A3] text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-3.5 text-[#8C93A3] hover:text-[#181A20] transition-colors"
                tabIndex={-1}
              >
                {showPassword ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3.5 px-4 bg-[#181A20] hover:bg-[#2A2E37] text-[#FFFFFF] font-medium rounded-xl transition-colors duration-150 flex items-center justify-center gap-2 shadow-sm cursor-pointer"
          >
            <span>Sign In</span>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-[#EBE6DF] flex items-center justify-between text-xs text-[#8C93A3]">
          <span>Any Gmail & password accepted</span>
          <button
            type="button"
            onClick={handleQuickDemo}
            className="text-[#2563EB] hover:underline font-medium cursor-pointer"
          >
            Quick Fill Demo
          </button>
        </div>
      </div>

      {/* Footer minimal info */}
      <div className="mt-8 text-center text-xs text-[#8C93A3] font-mono">
        Kyro Panel &bull; Technical, Product & HR AI Assessment
      </div>
    </div>
  );
}
