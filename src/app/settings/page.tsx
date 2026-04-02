'use client';

import { useState, useEffect } from 'react';

export default function SettingsPage() {
    const [pin, setPin] = useState('');
    const [adminPin, setAdminPin] = useState('');
    const [loading, setLoading] = useState(true);
    const [authenticated, setAuthenticated] = useState(false);
    const [shake, setShake] = useState(false);

    useEffect(() => {
        fetch('/api/sheet?tab=pos')
            .then(r => r.json())
            .then(d => { if (d.adminPin) setAdminPin(d.adminPin); })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        if (pin === adminPin) { setAuthenticated(true); }
        else { setShake(true); setTimeout(() => setShake(false), 500); setPin(''); }
    };

    const card: React.CSSProperties = { background: 'linear-gradient(135deg,rgba(15,23,42,0.95),rgba(15,30,55,0.95))', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16 };
    const lbl: React.CSSProperties = { color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const };

    if (!authenticated) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '70vh' }}>
                <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}} @keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}`}</style>
                <div style={{ ...card, padding: 40, width: '100%', maxWidth: 380, textAlign: 'center', animation: 'fadeUp 0.4s ease-out' }}>
                    <div style={{ fontSize: 40, marginBottom: 8 }}>🔐</div>
                    <h2 style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: '0 0 6px' }}>Admin Access</h2>
                    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 28 }}>Enter your PIN to access settings.</p>
                    <form onSubmit={handleLogin}>
                        <input type="password" value={pin} onChange={e => setPin(e.target.value)} maxLength={6} autoFocus
                            style={{ width: '100%', padding: '16px', textAlign: 'center', fontSize: 28, letterSpacing: '0.3em', background: 'rgba(255,255,255,0.06)', border: `1px solid ${shake ? 'rgba(255,71,87,0.5)' : 'rgba(255,255,255,0.12)'}`, borderRadius: 12, color: '#fff', outline: 'none', boxSizing: 'border-box', marginBottom: 16, animation: shake ? 'shake 0.4s ease' : 'none', transition: 'border-color 0.3s' }} />
                        <button type="submit" disabled={loading || !adminPin} style={{ width: '100%', padding: 14, background: loading || !adminPin ? '#333' : 'linear-gradient(135deg,#00D2FF,#3A7BD5)', color: loading || !adminPin ? '#888' : '#000', fontWeight: 900, fontSize: 14, borderRadius: 12, border: 'none', cursor: loading || !adminPin ? 'not-allowed' : 'pointer', letterSpacing: '0.08em', boxShadow: loading || !adminPin ? 'none' : '0 4px 20px rgba(0,210,255,0.25)' }}>
                            {loading ? 'INITIALIZING...' : 'ENTER'}
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
            <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}} .pbi-c{animation:fadeUp 0.35s ease-out both}`}</style>

            <div style={{ marginBottom: 28 }}>
                <h2 style={{ fontSize: 28, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em', margin: 0 }}>Admin Settings</h2>
                <p style={{ ...lbl, marginTop: 4, fontSize: 11 }}>● System Configuration & Preferences</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {[
                    {
                        icon: '🔑', title: 'Admin PIN', color: '#FFD93D',
                        desc: 'The admin PIN controls access to Settings, Payroll, Timekeeper edits, and Inventory audits.',
                        badge: `Current: ${adminPin}`, badgeColor: 'rgba(255,217,61,0.12)', badgeText: '#FFD93D', badgeBorder: 'rgba(255,217,61,0.3)',
                        location: 'POS_System_Control ➔ Row 2 (Column B)'
                    },
                    {
                        icon: '💧', title: 'Water Prices', color: '#00D2FF',
                        desc: 'Prices for Water Refill and Water Delivery.',
                        badge: 'Live', badgeColor: 'rgba(0,210,255,0.15)', badgeText: '#00D2FF', badgeBorder: 'rgba(0,210,255,0.3)',
                        location: 'POS_System_Control ➔ Rows 4-5 (Column B)'
                    },
                    {
                        icon: '🧊', title: 'Ice Prices (Selling & Cost)', color: '#A78BFA',
                        desc: 'Selling prices for 1KG-45KG ice. The packaging costs (plastics & sacks) are located further down.',
                        badge: 'Live', badgeColor: 'rgba(167,139,250,0.15)', badgeText: '#A78BFA', badgeBorder: 'rgba(167,139,250,0.3)',
                        location: 'POS_System_Control ➔ Selling R7-13 | Cost R14-20 (Column B)'
                    },
                    {
                        icon: '⚡', title: 'Machine Power & Electricity', color: '#FF6B6B',
                        desc: 'Row 21 = PHP per kWh. Row 22 = Machine Power rating (KG Output per Hour). Used in production.',
                        badge: 'Live', badgeColor: 'rgba(255,107,107,0.15)', badgeText: '#FF6B6B', badgeBorder: 'rgba(255,107,107,0.3)',
                        location: 'POS_System_Control ➔ Rows 21-22 (Column B)'
                    },
                    {
                        icon: '💰', title: 'Commission Rules', color: '#4ECB71',
                        desc: 'Logic for calculating delivery commissions for staff and drivers based on Water and Ice sales.',
                        badge: 'Live', badgeColor: 'rgba(78,203,113,0.12)', badgeText: '#4ECB71', badgeBorder: 'rgba(78,203,113,0.3)',
                        location: 'POS_System_Control ➔ Rows 25+ (Scroll down)'
                    },
                    {
                        icon: '👥', title: 'Base Salary', color: '#FF8A5C',
                        desc: 'Daily base pay for each employee added to their daily commission total.',
                        badge: 'Live', badgeColor: 'rgba(255,138,92,0.15)', badgeText: '#FF8A5C', badgeBorder: 'rgba(255,138,92,0.3)',
                        location: 'Employee ➔ Salary Column (varies by row)'
                    },
                ].map((item, i) => (
                    <div key={i} className="pbi-c" style={{ ...card, padding: 24, display: 'flex', alignItems: 'flex-start', gap: 20, animationDelay: `${i * 0.08}s` }}>
                        <div style={{ fontSize: 28, lineHeight: 1, flexShrink: 0 }}>{item.icon}</div>
                        <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                                <h3 style={{ fontSize: 16, fontWeight: 900, color: '#fff', margin: 0 }}>{item.title}</h3>
                                <span style={{ fontSize: 10, fontWeight: 900, padding: '3px 8px', borderRadius: 20, background: item.badgeColor, color: item.badgeText, border: `1px solid ${item.badgeBorder}`, letterSpacing: '0.04em' }}>{item.badge}</span>
                            </div>
                            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 14, lineHeight: 1.6 }}>{item.desc}</p>
                            <div style={{ display: 'inline-block', padding: '8px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em' }}>
                                <span style={{ color: 'rgba(255,255,255,0.3)', marginRight: 6 }}>EDIT IN GOOGLE SHEETS:</span>
                                {item.location}
                            </div>
                        </div>
                        <div style={{ width: 4, alignSelf: 'stretch', borderRadius: 4, background: item.color, opacity: 0.7, flexShrink: 0 }} />
                    </div>
                ))}
            </div>
        </div>
    );
}
