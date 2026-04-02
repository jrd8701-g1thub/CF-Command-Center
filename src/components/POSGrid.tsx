'use client';

import { POSItem } from '@/app/api/sheet/route';

interface POSGridProps {
    items: POSItem[];
    onAddToCart: (item: POSItem) => void;
}

export default function POSGrid({ items, onAddToCart }: POSGridProps) {
    if (items.length === 0) {
        return <div className="bg-charcoal-800 border border-charcoal-700 rounded-xl p-8 mt-6 text-center text-slate-400 font-bold text-sm shadow-lg">No items found in Google Sheets</div>;
    }

    // Separate items loosely based on names or category matching 'ice' or 'water'
    // Fallbacks just in case the Sheet category spelling changes.
    const iceItems = items.filter(i =>
        i.category.toLowerCase().includes('ice') || i.name.toLowerCase().includes('ice') || i.name.toLowerCase().includes('kg')
    );

    const waterItems = items.filter(i =>
        i.category.toLowerCase().includes('water') || i.name.toLowerCase().includes('water') || i.name.toLowerCase().includes('refill')
    );

    const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const itemId = e.target.value;
        if (!itemId) return;

        const item = items.find(i => i.id === itemId);
        if (item) {
            onAddToCart(item);
            // Reset dropdown to placeholder so they can immediately select again if they want
            e.target.value = '';
        }
    };

    return (
        <div className="mt-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">

                {/* Ice Dropdown Card */}
                <div className="bg-charcoal-800 border border-charcoal-700 rounded-xl p-5 shadow-lg group hover:border-brand-blue/30 transition-colors">
                    <h3 className="text-sm font-black text-brand-blue uppercase tracking-widest mb-4 flex items-center gap-2">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m14 2 6 6-6 6"/><path d="m4 12 6-6 6 6-6 6Z"/><path d="m10 22-6-6 6-6"/></svg>
                        Ice Products
                    </h3>
                    <select
                        className="w-full px-4 py-3 bg-charcoal-900 border border-charcoal-700 rounded-lg text-sm font-bold text-white outline-none focus:border-brand-blue transition-colors cursor-pointer"
                        onChange={handleSelect}
                        defaultValue=""
                        style={{ colorScheme: 'dark' }}
                    >
                        <option value="" disabled>-- Select Ice Product --</option>
                        {iceItems.map(item => (
                            <option key={item.id} value={item.id}>
                                {item.name} - ₱{(item.price || 0).toFixed(2)}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Water Dropdown Card */}
                <div className="bg-charcoal-800 border border-charcoal-700 rounded-xl p-5 shadow-lg group hover:border-brand-teal/30 transition-colors">
                    <h3 className="text-sm font-black text-brand-teal uppercase tracking-widest mb-4 flex items-center gap-2">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></svg>
                        Water Products
                    </h3>
                    <select
                        className="w-full px-4 py-3 bg-charcoal-900 border border-charcoal-700 rounded-lg text-sm font-bold text-white outline-none focus:border-brand-teal transition-colors cursor-pointer"
                        onChange={handleSelect}
                        defaultValue=""
                        style={{ colorScheme: 'dark' }}
                    >
                        <option value="" disabled>-- Select Water Product --</option>
                        {waterItems.map(item => (
                            <option key={item.id} value={item.id}>
                                {item.name} - ₱{(item.price || 0).toFixed(2)}
                            </option>
                        ))}
                    </select>
                </div>

            </div>
        </div>
    );
}
