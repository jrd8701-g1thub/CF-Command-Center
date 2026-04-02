'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  MonitorSmartphone, 
  Clock, 
  Wallet, 
  Truck, 
  History, 
  Factory, 
  Package, 
  Settings, 
  Users 
} from 'lucide-react';
import clsx from 'clsx';

export default function Navigation() {
    const pathname = usePathname();

    const links = [
        { href: '/timekeeper', label: 'TimeKeeper', icon: Clock },
        { href: '/', label: 'POS Terminal', icon: MonitorSmartphone },
        { href: '/delivery', label: 'Delivery', icon: Truck },
        { href: '/expenses', label: 'Expenses', icon: Wallet },
        { href: '/history', label: 'Sales History', icon: History },
        { href: '/production', label: 'Production', icon: Factory },
        { href: '/inventory', label: 'Inventory', icon: Package },
        { href: '/payroll', label: 'Payroll', icon: Users },
        { href: '/settings', label: 'Settings', icon: Settings },
    ];

    return (
        <aside className="fixed left-0 top-0 h-screen w-64 bg-charcoal-800 border-r border-charcoal-700 flex flex-col items-center py-6 px-4 z-50 shadow-[4px_0_24px_rgba(0,0,0,0.5)]">
            <div className="flex flex-col items-center mb-10 w-full mt-2">
                <img src="/logo.jpg" alt="Logo" className="h-16 w-16 rounded-xl object-contain mb-4 bg-charcoal-900 p-1 shadow-inner border border-charcoal-700" />
                <h1 className="text-xl font-bold text-white tracking-wide">Command Center</h1>
                <p className="text-[10px] text-brand-teal mt-1.5 font-bold uppercase tracking-[0.2em]">Point of Sale</p>
            </div>
            
            <nav className="flex flex-col gap-1.5 w-full flex-1 overflow-y-auto scrollbar-thin pr-1">
                {links.map((link) => {
                    const isActive = pathname === link.href;
                    const Icon = link.icon;
                    return (
                        <Link
                            key={link.href}
                            href={link.href}
                            className={clsx(
                                "flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-300 font-semibold text-sm",
                                isActive 
                                    ? "bg-brand-blue/15 text-brand-blue border border-brand-blue/30 shadow-[0_0_15px_rgba(58,134,255,0.15)]" 
                                    : "text-slate-400 border border-transparent hover:text-white hover:bg-charcoal-700/50 hover:border-charcoal-600/50"
                            )}
                        >
                            <Icon size={18} strokeWidth={isActive ? 2.5 : 2} className={isActive ? "text-brand-blue" : "text-slate-500"} />
                            <span className="mt-0.5">{link.label}</span>
                        </Link>
                    );
                })}
            </nav>
            
            <div className="mt-auto w-full pt-6 border-t border-charcoal-700 pb-2">
                <div className="flex items-center gap-3 px-2">
                    <div className="w-9 h-9 rounded-full bg-brand-orange/15 border border-brand-orange/40 flex items-center justify-center text-brand-orange font-bold text-sm shadow-[0_0_10px_rgba(255,69,0,0.2)]">
                        AD
                    </div>
                    <div className="flex flex-col">
                        <p className="text-sm font-bold text-white leading-tight">Admin System</p>
                        <div className="flex items-center gap-1.5 mt-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-brand-teal shadow-[0_0_5px_#00E5FF] animate-pulse" />
                            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Online</p>
                        </div>
                    </div>
                </div>
            </div>
        </aside>
    );
}
