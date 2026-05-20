'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageSquare, Calendar, Bookmark, Settings, Users, UsersRound, Video } from 'lucide-react';
import styles from './BottomNav.module.css';

export default function BottomNav() {
    const pathname = usePathname();

    // Hide nav on login/register if needed, but for now show everywhere except maybe root if it's a splash?
    // Let's assume it's always visible for authenticated pages.

    const navItems = [
        { name: 'Follow Ups', href: '/home', icon: MessageSquare },
        { name: 'Videolar', href: '/videos', icon: Video },
        { name: 'Takvim', href: '/calendar', icon: Calendar },
        { name: 'YouTubers', href: '/catalog', icon: Users },
        { name: 'Team', href: '/team', icon: UsersRound },
        { name: 'Ayarlar', href: '/settings', icon: Settings },
    ];

    return (
        <nav className={styles.nav}>
            <div className={styles.navContainer}>
                {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname.startsWith(item.href) || (pathname === '/' && item.href === '/home');

                    return (
                        <Link key={item.name} href={item.href} className={`${styles.navItem} ${isActive ? styles.active : ''}`}>
                            <Icon size={24} className={styles.icon} />
                            <span className={styles.label}>{item.name}</span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
