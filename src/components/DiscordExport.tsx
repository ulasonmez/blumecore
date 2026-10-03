'use client';

import { useEffect, useRef, useState } from 'react';
import { Copy, Download, X, ChevronDown, ChevronUp } from 'lucide-react';
import { buildSelectedDiscordExport, type DiscordContact, type DiscordExportCategory } from '@/lib/discord-contacts';
import styles from './DiscordContacts.module.css';

interface DiscordExportProps {
    contacts: DiscordContact[];
    categories?: DiscordExportCategory[];
}

export default function DiscordExport({ contacts, categories }: DiscordExportProps) {
    const [open, setOpen] = useState(false);
    return <>
        <button type="button" className={styles.exportButton} onClick={() => setOpen(true)}>
            <Download size={14} /> Export
        </button>
        {open && <ExportDialog contacts={contacts} categories={categories} onClose={() => setOpen(false)} />}
    </>;
}

function ExportDialog({ contacts, categories, onClose }: DiscordExportProps & { onClose: () => void }) {
    const dialog = useRef<HTMLDialogElement>(null);
    const textarea = useRef<HTMLTextAreaElement>(null);
    const [message, setMessage] = useState('');
    const allContacts = categories ? categories.flatMap(category => category.contacts) : contacts;
    const [selectedIds, setSelectedIds] = useState(() => [...new Set(allContacts.filter(contact => contact.discordId?.trim()).map(contact => contact.id))]);
    const [expandedNames, setExpandedNames] = useState<string[]>([]);
    const content = buildSelectedDiscordExport(allContacts, selectedIds);
    function updateSelection(ids: string[]) {
        setSelectedIds([...new Set(ids)]);
        setMessage('');
    }
    const count = content ? content.split('\n').length : 0;
    useEffect(() => { dialog.current?.showModal(); }, []);

    async function copy() {
        try {
            await navigator.clipboard.writeText(content);
            setMessage('Kopyalandı.');
        } catch {
            textarea.current?.focus();
            textarea.current?.select();
            setMessage('Panoya erişilemedi. Seçili metni elle kopyalayabilirsiniz.');
        }
    }

    return (
        <dialog ref={dialog} className={styles.dialog} aria-labelledby="discord-export-title" onCancel={onClose}
            onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
            <div className={styles.dialogContent}>
                <div className={styles.dialogHeader}>
                    <h2 id="discord-export-title">Discord Export</h2>
                    <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Kapat"><X size={22} /></button>
                </div>
                <div className={styles.dialogBody}>
                {categories && (
                    <fieldset className={styles.categoryFieldset}>
                        <legend>Kategorileri seç</legend>
                        <div className={styles.selectionActions}>
                            <button type="button" onClick={() => updateSelection(allContacts.filter(contact => contact.discordId?.trim()).map(contact => contact.id))}>Tümünü seç</button>
                            <button type="button" onClick={() => updateSelection([])}>Seçimi temizle</button>
                        </div>
                        <div className={styles.categoryList}>
                            {categories.map((category, index) => {
                                const categoryContacts = [...new Map(category.contacts.map(contact => [contact.id, contact])).values()];
                                const eligible = categoryContacts.filter(contact => contact.discordId?.trim());
                                const selectedCount = eligible.filter(contact => selectedIds.includes(contact.id)).length;
                                const expanded = expandedNames.includes(category.name);
                                return (
                                    <div key={category.name} className={styles.categoryGroup}>
                                        <div className={styles.categoryHeader}>
                                            <SelectionCheckbox label={`${category.name} kategorisinin tümünü seç`} checked={eligible.length > 0 && selectedCount === eligible.length}
                                                mixed={selectedCount > 0 && selectedCount < eligible.length} disabled={eligible.length === 0}
                                                onChange={checked => updateSelection(checked
                                                    ? [...selectedIds, ...eligible.map(contact => contact.id)]
                                                    : selectedIds.filter(id => !eligible.some(contact => contact.id === id)))} />
                                            <button type="button" className={styles.expandCategory} aria-expanded={expanded} aria-controls={`discord-category-${index}`}
                                                onClick={() => setExpandedNames(expanded ? expandedNames.filter(name => name !== category.name) : [...expandedNames, category.name])}>
                                                <span>{category.name}<small>{selectedCount} / {eligible.length} seçili</small></span>
                                                {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                            </button>
                                        </div>
                                        {expanded && <div id={`discord-category-${index}`} className={styles.contactList}>
                                            {categoryContacts.map(contact => <label key={contact.id} className={styles.contactOption}>
                                                <input type="checkbox" className={styles.checkbox} disabled={!contact.discordId?.trim()}
                                                    checked={!!contact.discordId?.trim() && selectedIds.includes(contact.id)}
                                                    onChange={event => updateSelection(event.target.checked ? [...selectedIds, contact.id] : selectedIds.filter(id => id !== contact.id))} />
                                                <span>{contact.name}<small>{contact.discordId || 'Discord ID eklenmedi'}</small></span>
                                            </label>)}
                                            {categoryContacts.length === 0 && <p className={styles.hint}>Bu kategoride YouTuber yok.</p>}
                                        </div>}
                                    </div>
                                );
                            })}
                        </div>
                        {categories.length === 0 && <p className={styles.hint}>Gösterilecek kategori yok.</p>}
                    </fieldset>
                )}
                <p className={styles.hint}>{categories ? 'Seçili kişilerde ve mevcut aramada' : 'Mevcut arama ve filtrelerde'} Discord ID’si bulunan {count} YouTuber. Her kişi bir kez listelenir.</p>
                <textarea ref={textarea} aria-label="Kopyalanabilir Discord listesi" readOnly value={content}
                    placeholder={categories && selectedIds.length === 0 ? "Metni oluşturmak için bir YouTuber seçin." : "Bu listede Discord ID’si eklenmiş YouTuber yok."} className={styles.exportText} />
                </div>
                <div className={styles.exportFooter}>
                    <span role="status" className={styles.hint}>{message}</span>
                    <button type="button" className="btn-primary" onClick={copy} disabled={!content}><Copy size={16} /> Kopyala</button>
                </div>
            </div>
        </dialog>
    );
}

function SelectionCheckbox({ label, checked, mixed, disabled, onChange }: {
    label: string; checked: boolean; mixed: boolean; disabled: boolean; onChange: (checked: boolean) => void;
}) {
    const input = useRef<HTMLInputElement>(null);
    useEffect(() => { if (input.current) input.current.indeterminate = mixed; }, [mixed]);
    return <label className={styles.categoryToggle}><input ref={input} type="checkbox" className={styles.checkbox} aria-label={label}
        checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} /></label>;
}
