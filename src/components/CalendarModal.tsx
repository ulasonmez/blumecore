'use client';

import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
    format,
    addMonths,
    subMonths,
    startOfMonth,
    endOfMonth,
    eachDayOfInterval,
    isSameMonth,
    isToday,
    isSameDay,
    getDay,
} from 'date-fns';
import { tr } from 'date-fns/locale';
import styles from './CalendarModal.module.css';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '@/lib/auth-context';

interface CalendarModalProps {
    isOpen: boolean;
    onClose: () => void;
    youtuberId: string;
    title: string;
    channelUrl?: string;
}

interface RecordData {
    id: string;
    amount: number;
    date: Date;
}

export default function CalendarModal({
    isOpen,
    onClose,
    youtuberId,
    title,
    channelUrl,
}: CalendarModalProps) {
    const { user } = useAuth();
    const [records, setRecords] = useState<RecordData[]>([]);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);

    useEffect(() => {
        if (!isOpen || !user || !youtuberId) return;

        const q = query(
            collection(db, "records"),
            where("userId", "==", user.uid),
            where("youtuberId", "==", youtuberId)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data: RecordData[] = [];
            snapshot.forEach(doc => {
                const rec = doc.data();
                if (rec.date && typeof rec.date.toDate === 'function') {
                    data.push({
                        id: doc.id,
                        amount: Number(rec.amount) || 0,
                        date: rec.date.toDate()
                    });
                }
            });
            setRecords(data);
        });

        return () => unsubscribe();
    }, [isOpen, user, youtuberId]);

    if (!isOpen) return null;

    const allTimeTotal = records.reduce((sum, r) => sum + r.amount, 0);
    const currentMonthRecords = records.filter(r => isSameMonth(r.date, currentDate));
    const monthlyTotal = currentMonthRecords.reduce((sum, r) => sum + r.amount, 0);
    const recordDates = records.map(r => r.date);

    const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
    const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

    const startDate = startOfMonth(currentDate);
    const endDate = endOfMonth(currentDate);

    // Pad the start of the month with empty slots if it doesn't start on Monday
    // getDay returns 0 for Sunday, 1 for Monday. We want Monday to be 0 for our grid.
    const startDayOfWeek = getDay(startDate);
    const offset = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;
    const paddingDays = Array.from({ length: offset }).map((_, i) => `pad-${i}`);

    const daysInMonth = eachDayOfInterval({ start: startDate, end: endDate });

    const weekDays = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cts', 'Paz'];

    const selectedDateRecords = selectedDate
        ? records.filter(r => isSameDay(r.date, selectedDate))
        : [];

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <div className={styles.header}>
                    <div>
                        <h2 className={styles.title} style={{ marginBottom: channelUrl ? '4px' : '0' }}>{title}</h2>
                        {channelUrl && (
                            <a
                                href={channelUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ fontSize: '12px', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '4px' }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <span style={{ textDecoration: 'underline' }}>Kanalı Ziyaret Et</span>
                            </a>
                        )}
                    </div>
                    <button className={styles.closeBtn} onClick={onClose} style={{ alignSelf: 'flex-start' }}>
                        <X size={24} />
                    </button>
                </div>

                <div className={styles.statsRow}>
                    <div className={styles.statCard}>
                        <div className={styles.statValue}>${monthlyTotal}</div>
                        <div className={styles.statLabel}>Bu Ay</div>
                    </div>
                    <div className={styles.statCard}>
                        <div className={styles.statValue}>${allTimeTotal}</div>
                        <div className={styles.statLabel}>Toplam</div>
                    </div>
                </div>

                <div className={styles.calendarContainer}>
                    <div className={styles.monthSelector}>
                        <button onClick={prevMonth} className={styles.navBtn}>
                            <ChevronLeft size={20} />
                        </button>
                        <div className={styles.currentMonth}>
                            {format(currentDate, 'MMMM yyyy', { locale: tr })}
                        </div>
                        <button onClick={nextMonth} className={styles.navBtn}>
                            <ChevronRight size={20} />
                        </button>
                    </div>

                    <div className={styles.weekDays}>
                        {weekDays.map((day) => (
                            <div key={day} className={styles.weekDay}>
                                {day}
                            </div>
                        ))}
                    </div>

                    <div className={styles.daysGrid}>
                        {paddingDays.map((pad) => (
                            <div key={pad} className={styles.dayCell}></div>
                        ))}

                        {daysInMonth.map((day) => {
                            const hasRecord = recordDates.some((r) => isSameDay(r, day));
                            const isCurrentMonth = isSameMonth(day, currentDate);
                            const isDayToday = isToday(day);
                            const isSelected = selectedDate && isSameDay(day, selectedDate);

                            return (
                                <div
                                    key={day.toString()}
                                    className={`${styles.dayCell} ${!isCurrentMonth ? styles.disabledDay : ''} ${isSelected ? styles.selectedDay : ''}`}
                                    onClick={() => setSelectedDate(day)}
                                    style={{ cursor: 'pointer', border: isSelected ? '1px solid var(--accent-purple)' : '1px solid transparent' }}
                                >
                                    <span className={`${styles.dayNumber} ${isDayToday ? styles.today : ''}`}>
                                        {format(day, 'd')}
                                    </span>
                                    {hasRecord && (
                                        <div className={styles.dots}>
                                            <span className={styles.dot}></span>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {selectedDate && (
                        <div style={{ marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                            <h3 style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                                {format(selectedDate, 'd MMMM yyyy', { locale: tr })} Kayıtları
                            </h3>
                            {selectedDateRecords.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {selectedDateRecords.map(record => (
                                        <div key={record.id} style={{ display: 'flex', justifyContent: 'space-between', backgroundColor: 'var(--bg-card)', padding: '12px', borderRadius: '8px' }}>
                                            <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>Gelir</span>
                                            <span style={{ color: 'var(--accent-purple)', fontWeight: 700 }}>${record.amount}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Bu tarihte kayıt bulunmuyor.</p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
