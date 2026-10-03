'use client';

import { useEffect, useState } from 'react';
import { doc, onSnapshot, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import styles from './DiscordContacts.module.css';

export default function DiscordContactEditor({ youtuberId }: { youtuberId: string }) {
    const [savedValue, setSavedValue] = useState('');
    const [draft, setDraft] = useState<string | null>(null);
    const [ready, setReady] = useState(false);
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
            setMessage(normalized ? 'Discord ID kaydedildi.' : 'Discord ID kaldırıldı.');
        } catch {
            setMessage('Kaydedilemedi. Lütfen tekrar deneyin.');
        } finally {
            setSaving(false);
        }
    }

    return (
        <form className={styles.editor} onSubmit={save}>
            <label htmlFor={`discord-${youtuberId}`} className={styles.label}>Discord ID</label>
            <div className={styles.inputRow}>
                <input id={`discord-${youtuberId}`} type="text" placeholder="Discord kullanıcı ID’si" autoComplete="off"
                    value={value} disabled={!ready || saving} onChange={event => { setDraft(event.target.value); setMessage(''); }} />
                <button type="submit" className="btn-primary" disabled={!ready || saving || value.trim() === savedValue}>
                    {saving ? 'Kaydediliyor…' : 'Kaydet'}
                </button>
            </div>
            <p className={styles.hint}>Sonradan değiştirebilir veya alanı boş bırakıp kaydederek kaldırabilirsiniz.</p>
            <p className={styles.feedback} role="status">{message}</p>
        </form>
    );
}
