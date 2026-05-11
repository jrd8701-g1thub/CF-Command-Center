'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Sidebar() {
    const pathname = usePathname();

    const navItems = [
        { name: 'POS Terminal', href: '/', icon: '🏪' },
        { name: 'Production', href: '/production', icon: '🏗️' },
        { name: 'Inventory', href: '/inventory', icon: '📦' },
        { name: 'Sales History', href: '/history', icon: '📊' },
        { name: 'Staff Management', href: '/staff', icon: '👤' },
        { name: 'Admin Settings', href: '/settings', icon: '⚙️' },
    ];

    return (
        <aside className="w-64 bg-card border-r border-border h-screen sticky top-0 flex flex-col pt-4 overflow-y-auto">
            <div className="px-6 mb-8">
                <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Navigation</h2>
            </div>

            <nav className="flex-1 px-4 space-y-2">
                {navItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group ${isActive
                                ? 'bg-cyan/10 text-cyan border border-cyan/20 shadow-sm shadow-cyan/5'
                                : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                                }`}
                        >
                            <span className={`text-xl transition-transform duration-200 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`}>
                                {item.icon}
                            </span>
                            <span className="font-medium">{item.name}</span>
                            {isActive && (
                                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-cyan shadow-[0_0_8px_rgba(6,182,212,0.5)]"></div>
                            )}
                        </Link>
                    );
                })}
            </nav>

            <div className="p-6 border-t border-border mt-auto flex flex-col gap-3">
                <div className="bg-secondary/50 rounded-xl p-4 border border-border/50">
                    <p className="text-xs text-muted-foreground mb-1">Status</p>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                        <span className="text-sm font-medium">System Online</span>
                    </div>
                </div>
                
                <button 
                    onClick={() => {
                        localStorage.removeItem('loggedInUser');
                        localStorage.removeItem('staffName');
                        localStorage.removeItem('login_timestamp');
                        window.location.reload();
                    }}
                    className="w-full py-2.5 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 text-xs font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
                >
                    <span className="text-base">⎋</span> Switch User
                </button>
            </div>
        </aside>
    );
}
