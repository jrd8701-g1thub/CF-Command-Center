'use client';

import { useState, useEffect } from 'react';

const SESSION_DURATION_MS = 18 * 60 * 60 * 1000; // 18 hours

interface AuthWrapperProps {
    children: React.ReactNode;
}

export default function AuthWrapper({ children }: AuthWrapperProps) {
    const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [staffList, setStaffList] = useState<any[]>([]);
    const [isFetchingStaff, setIsFetchingStaff] = useState(true);

    useEffect(() => {
        // Fetch staff list on mount to have PINs ready
        fetch('/api/sheet?tab=staff')
            .then(res => res.json())
            .then(data => {
                if (data.employees) {
                    setStaffList(data.employees);
                }
            })
            .catch(err => console.error("Failed to load staff list for auth", err))
            .finally(() => setIsFetchingStaff(false));

        // Check session
        const storedUser = localStorage.getItem('loggedInUser') || localStorage.getItem('staffName');
        const storedTime = localStorage.getItem('login_timestamp');

        if (storedUser && storedTime) {
            const timeDiff = Date.now() - parseInt(storedTime, 10);
            if (timeDiff < SESSION_DURATION_MS) {
                // Keep staffName in sync just in case other parts of the app use it
                localStorage.setItem('staffName', storedUser); 
                setIsAuthenticated(true);
            } else {
                // Session expired
                localStorage.removeItem('loggedInUser');
                localStorage.removeItem('staffName');
                localStorage.removeItem('login_timestamp');
                setIsAuthenticated(false);
            }
        } else {
            setIsAuthenticated(false);
        }
    }, []);

    const handlePinInput = (num: string) => {
        if (pin.length < 6) {
            setPin(prev => prev + num);
            setError('');
        }
    };

    const handleDelete = () => {
        setPin(prev => prev.slice(0, -1));
        setError('');
    };

    const handleLogin = () => {
        if (!pin) return;
        if (isFetchingStaff) { setError('Still loading, please wait...'); return; }
        setLoading(true);

        const user = staffList.find(s => s.pin === pin);
        
        if (user) {
            const now = Date.now().toString();
            localStorage.setItem('loggedInUser', user.name);
            localStorage.setItem('staffName', user.name); // Backwards compatibility
            localStorage.setItem('login_timestamp', now);
            setIsAuthenticated(true);
        } else {
            setError('Invalid PIN');
            setPin('');
        }
        setLoading(false);
    };

    // Auto-login when 6 digits are reached — only check after staff list is fully loaded
    useEffect(() => {
        if (pin.length === 6 && !isFetchingStaff) {
            const match = staffList.find(s => s.pin === pin);
            if (match) {
                handleLogin();
            } else {
                setError('Invalid PIN');
                setPin('');
            }
        }
    }, [pin, staffList, isFetchingStaff]);

    if (isAuthenticated === null || (isAuthenticated === false && isFetchingStaff)) {
        return <div className="h-screen w-screen bg-charcoal-950 flex flex-col items-center justify-center gap-4">
            <div className="w-10 h-10 border-4 border-brand-blue/30 border-t-brand-blue rounded-full animate-spin"></div>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest animate-pulse">Initializing Secure Connection...</p>
        </div>;
    }

    if (isAuthenticated) {
        return <>{children}</>;
    }

    return (
        <div className="h-screen w-screen bg-charcoal-950 flex items-center justify-center relative overflow-hidden text-white font-sans">
            {/* Background blur/accents */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-blue/10 blur-[120px] rounded-full pointer-events-none"></div>
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-brand-purple/10 blur-[120px] rounded-full pointer-events-none"></div>

            <div className="w-full max-w-sm bg-charcoal-900/80 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl relative z-10 flex flex-col items-center">
                <div className="mb-8 text-center">
                    <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-brand-blue to-cyan mb-2">C&amp;F System</h1>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Enter Access PIN</p>
                </div>

                <div className="flex gap-4 mb-8">
                    {Array.from({ length: Math.max(6, pin.length) }).map((_, i) => (
                        <div key={i} className={`w-4 h-4 rounded-full transition-all duration-300 ${i < pin.length ? 'bg-brand-blue scale-110 shadow-[0_0_10px_rgba(58,134,255,0.8)]' : 'bg-charcoal-800'}`}></div>
                    ))}
                </div>

                {error && <p className="text-red-400 text-xs font-bold uppercase tracking-widest mb-6 animate-pulse">{error}</p>}

                <div className="grid grid-cols-3 gap-4 w-full">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                        <button
                            key={num}
                            onClick={() => handlePinInput(num.toString())}
                            className="aspect-square rounded-2xl bg-charcoal-800/50 hover:bg-charcoal-700 border border-white/5 text-2xl font-black transition-all active:scale-95"
                        >
                            {num}
                        </button>
                    ))}
                    <button
                        onClick={handleDelete}
                        className="aspect-square rounded-2xl bg-charcoal-800/50 hover:bg-charcoal-700 border border-white/5 text-xl font-black transition-all active:scale-95 flex items-center justify-center text-slate-400 hover:text-white"
                    >
                        ⌫
                    </button>
                    <button
                        onClick={() => handlePinInput('0')}
                        className="aspect-square rounded-2xl bg-charcoal-800/50 hover:bg-charcoal-700 border border-white/5 text-2xl font-black transition-all active:scale-95"
                    >
                        0
                    </button>
                    <button
                        onClick={handleLogin}
                        disabled={loading}
                        className="aspect-square rounded-2xl bg-brand-blue/20 hover:bg-brand-blue/30 border border-brand-blue/50 text-brand-blue text-sm font-black transition-all active:scale-95 uppercase tracking-widest"
                    >
                        {loading ? '...' : 'OK'}
                    </button>
                </div>
                
                <div className="mt-8 text-center opacity-30 text-[9px] font-bold uppercase tracking-widest">
                    Authorized Personnel Only
                </div>
            </div>
        </div>
    );
}
