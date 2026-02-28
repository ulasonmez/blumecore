'use client';

import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Plus, Trash2, Edit2, Check, X } from 'lucide-react';
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
import styles from './Calendar.module.css';
import RecordModal from '@/components/RecordModal';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '@/lib/auth-context';

export default function CalendarPage() {
    const { user } = useAuth();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);

    const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
    const [editAmount, setEditAmount] = useState('');

    const [records, setRecords] = useState<any[]>([]);
    const [youtubers, setYoutubers] = useState<any[]>([]);
    const [teamMembers, setTeamMembers] = useState<any[]>([]);

    useEffect(() => {
        if (!user) return;
        const q = query(collection(db, "records"), where("userId", "==", user.uid));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data: any[] = [];
            snapshot.forEach(doc => {
                const rec = doc.data();
                if (rec.date && typeof rec.date.toDate === 'function') {
                    data.push({ ...rec, id: doc.id, date: rec.date.toDate() });
                }
            });
            setRecords(data);
        });
        return () => unsubscribe();
    }, [user]);

    useEffect(() => {
        if (!user) return;
        const q = query(collection(db, "youtubers"), where("userId", "==", user.uid));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data: any[] = [];
            snapshot.forEach(doc => data.push({ id: doc.id, name: doc.data().name }));
            setYoutubers(data);
        });
        return () => unsubscribe();
    }, [user]);

    useEffect(() => {
        if (!user) return;
        const q = query(collection(db, "team"), where("userId", "==", user.uid));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data: any[] = [];
            snapshot.forEach(doc => data.push({ id: doc.id, name: doc.data().name }));
            setTeamMembers(data);
        });
        return () => unsubscribe();
    }, [user]);

    const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
    const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

    const startDate = startOfMonth(currentDate);
    const endDate = endOfMonth(currentDate);

    const startDayOfWeek = getDay(startDate);
    const offset = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;
    const paddingDays = Array.from({ length: offset }).map((_, i) => `pad-${i}`);

    const daysInMonth = eachDayOfInterval({ start: startDate, end: endDate });
    const weekDays = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cts', 'Paz'];

    const incomeRecords = records.filter(r => r.type !== 'expense');
    const expenseRecords = records.filter(r => r.type === 'expense');

    const currentMonthRecords = records.filter(r => isSameMonth(r.date, currentDate));
    const monthlyIncome = currentMonthRecords.filter(r => r.type !== 'expense').reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const monthlyExpense = currentMonthRecords.filter(r => r.type === 'expense').reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const allTimeIncome = incomeRecords.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const allTimeExpense = expenseRecords.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

    const selectedDateRecords = records.filter(r => isSameDay(r.date, selectedDate));

    return (
        <div className={styles.container}>
            <div className={styles.headerRow}>
                <div>
                    <h1 className="page-title">Takvim</h1>
                    <p className="page-subtitle" style={{ marginBottom: 0 }}>Geçmiş kayıtlarınızı inceleyin</p>
                </div>
            </div>

            {/* Stats Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '20px' }}>
                <div className="card" style={{ padding: '12px', textAlign: 'center' }}>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: '#22C55E' }}>${monthlyIncome.toFixed(2)}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Bu Ay Gelir</div>
                </div>
                <div className="card" style={{ padding: '12px', textAlign: 'center' }}>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: '#EF4444' }}>${monthlyExpense.toFixed(2)}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Bu Ay Gider</div>
                </div>
                <div className="card" style={{ padding: '12px', textAlign: 'center' }}>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: '#22C55E' }}>${allTimeIncome.toFixed(2)}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Genel Gelir</div>
                </div>
                <div className="card" style={{ padding: '12px', textAlign: 'center' }}>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: '#EF4444' }}>${allTimeExpense.toFixed(2)}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Genel Gider</div>
                </div>
            </div>

            <div className={styles.calendarCard}>
                <div className={styles.monthSelector}>
                    <button onClick={prevMonth} className={styles.navBtn}>
                        <ChevronLeft size={24} />
                    </button>
                    <div className={styles.currentMonth}>
                        {format(currentDate, 'MMMM yyyy', { locale: tr })}
                    </div>
                    <button onClick={nextMonth} className={styles.navBtn}>
                        <ChevronRight size={24} />
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
                        const isCurrentMonth = isSameMonth(day, currentDate);
                        const isDayToday = isToday(day);
                        const isSelected = isSameDay(day, selectedDate);
                        const hasRecord = records.some(r => isSameDay(r.date, day));

                        return (
                            <div
                                key={day.toString()}
                                className={`${styles.dayCell} ${!isCurrentMonth ? styles.disabledDay : ''}`}
                                onClick={() => setSelectedDate(day)}
                            >
                                <span className={`${styles.dayNumber} ${isDayToday ? styles.today : ''} ${isSelected && !isDayToday ? styles.selected : ''}`}>
                                    {format(day, 'd')}
                                </span>
                                {hasRecord && (
                                    <div style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: 'var(--accent-purple)', marginTop: '4px' }}></div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className={styles.dateDetailsHeader}>
                <h2 className={styles.selectedDateTitle}>
                    {format(selectedDate, 'd MMMM eee', { locale: tr })}
                </h2>
                <button
                    className="btn-secondary"
                    style={{ padding: '8px 16px', fontSize: '13px' }}
                    onClick={() => setIsRecordModalOpen(true)}
                >
                    <Plus size={16} style={{ marginRight: '4px' }} /> Kayıt Ekle
                </button>
            </div>

            {selectedDateRecords.length === 0 ? (
                <div className={styles.emptyStateCard}>
                    Bu tarihte kayıt bulunmuyor.
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {selectedDateRecords.map((record) => {
                        const isExpense = record.type === 'expense';
                        const personName = isExpense
                            ? teamMembers.find(t => t.id === record.teamMemberId)?.name || 'Bilinmiyor'
                            : youtubers.find(y => y.id === record.youtuberId)?.name || 'Bilinmiyor';
                        const isEditing = editingRecordId === record.id;
                        return (
                            <div key={record.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                                    <span style={{ fontWeight: 500 }}>{personName}</span>
                                    <span style={{ fontSize: '11px', color: isExpense ? '#EF4444' : '#22C55E' }}>
                                        {isExpense ? 'Gider' : 'Gelir'}
                                    </span>
                                    {record.description ? (
                                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px', fontStyle: 'italic' }}>
                                            {record.description}
                                        </span>
                                    ) : null}
                                </div>
                                {isEditing ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <input
                                            type="number"
                                            value={editAmount}
                                            onChange={(e) => setEditAmount(e.target.value)}
                                            style={{ width: '80px', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--accent-purple)', backgroundColor: '#1A1D28', color: 'white', fontSize: '14px', outline: 'none' }}
                                            autoFocus
                                        />
                                        <button onClick={async () => { if (editAmount) { await updateDoc(doc(db, 'records', record.id), { amount: parseFloat(editAmount) }); } setEditingRecordId(null); }} style={{ background: 'none', border: 'none', color: 'var(--accent-purple)', cursor: 'pointer', padding: '4px' }}><Check size={16} /></button>
                                        <button onClick={() => setEditingRecordId(null)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}><X size={16} /></button>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span style={{ fontWeight: 700, color: isExpense ? '#EF4444' : '#22C55E' }}>
                                            {isExpense ? '-' : '+'}${record.amount}
                                        </span>
                                        <button onClick={() => { setEditingRecordId(record.id); setEditAmount(record.amount.toString()); }} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}><Edit2 size={14} /></button>
                                        <button onClick={async () => { if (confirm('Bu kaydı silmek istediğinize emin misiniz?')) { await deleteDoc(doc(db, 'records', record.id)); } }} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}><Trash2 size={14} /></button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {
                isRecordModalOpen && (
                    <RecordModal
                        isOpen={isRecordModalOpen}
                        onClose={() => setIsRecordModalOpen(false)}
                        initialDate={selectedDate}
                    />
                )
            }
        </div>
    );
}
