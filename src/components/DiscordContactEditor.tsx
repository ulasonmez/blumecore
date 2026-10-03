'use client';

import { useEffect, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { doc, onSnapshot, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import styles from './DiscordContacts.module.css';

export default function DiscordContactEditor({ youtuberId }: { youtuberId: string }) {
    const [savedValue, setSavedValue] = useState('');
    const [draft, setDraft] = useState<string | null>(null);
    const [ready, setReady] = useState(false);
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const value = draft ?? savedValue;

    useEffect(() => onSnapshot(doc(db, 'youtubers', youtuberId), snapshot => {
        setSavedValue(snapshot.data()?.discordId ?? '');
        setReady(snapshot.exists());
        if (!snapshot.exists()) setMessage('YouTuber kaydı bulunamadı.');
    }, () => {
        setReady(false);
        setMessage('Discord bilgisi yüklenemedi.');
    }), [youtuberId]);

    async function save(event: React.FormEvent) {
        event.preventDefault();
        if (!ready || saving) return;
        setSaving(true);
        setMessage('');
        try {
            const normalized = value.trim();
            await updateDoc(doc(db, 'youtubers', youtuberId), {
                discordId: normalized || deleteField(),
            });
            setSavedValue(normalized);
            setDraft(null);
            setEditing(false);
            setMessage(normalized ? 'Discord ID kaydedildi.' : 'Discord ID kaldırıldı.');
        } catch {
            setMessage('Kaydedilemedi. Lütfen tekrar deneyin.');
        } finally {
            setSaving(false);
        }
    }

    if (!editing) return (
        <div className={styles.editor}>
            <span className={styles.label}>Discord ID</span>
            <div className={styles.savedContact}>
                <span className={styles.savedId}>{ready ? (savedValue || 'Henüz eklenmedi') : 'Yükleniyor…'}</span>
                <button type="button" className={styles.editButton} disabled={!ready} onClick={() => {
                    setDraft(savedValue); setMessage(''); setEditing(true);
                }}>{savedValue ? <Pencil size={14} /> : <Plus size={14} />}{savedValue ? 'Düzenle' : 'Ekle'}</button>
            </div>
            <p className={styles.feedback} role="status">{message}</p>
        </div>
    );

    return (
        <form className={styles.editor} onSubmit={save}>
            <label htmlFor={`discord-${youtuberId}`} className={styles.label}>Discord ID</label>
            <div className={styles.inputRow}>
                <input id={`discord-${youtuberId}`} type="text" placeholder="Discord kullanıcı ID’si" autoComplete="off" autoFocus
                    value={value} disabled={!ready || saving} onChange={event => { setDraft(event.target.value); setMessage(''); }} />
                <button type="submit" className="btn-primary" disabled={!ready || saving || value.trim() === savedValue}>
                    {saving ? 'Kaydediliyor…' : 'Kaydet'}
                </button>
            </div>
            <button type="button" className={styles.cancelEdit} disabled={saving} onClick={() => {
                setDraft(null); setMessage(''); setEditing(false);
            }}>Vazgeç</button>
            <p className={styles.hint}>Discord ID’yi kaldırmak için alanı boş bırakıp kaydedin.</p>
            <p className={styles.feedback} role="status">{message}</p>
        </form>
    );
}
