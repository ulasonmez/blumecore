'use client';

import { CheckCircle2, CircleDashed, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import styles from './PaymentVideoLinks.module.css';
import {
    PAYMENT_STATUS_LABELS,
    getAssignmentPaymentStatus,
    type AssignmentPaymentStatus,
    type AssignmentPaymentSummary,
    type PaidAssignmentLink,
    type PaymentCoverage,
} from '@/lib/payment-links';

export function PaymentStatusBadge({ status, compact = false }: { status: AssignmentPaymentStatus; compact?: boolean }) {
    const Icon = status === 'paid' ? CheckCircle2 : status === 'partial' ? CircleDashed : XCircle;
    return (
        <span className={`${styles.badge} ${styles[status]}`} title={PAYMENT_STATUS_LABELS[status]}>
            <Icon size={compact ? 13 : 14} aria-hidden="true" />
            {compact ? null : PAYMENT_STATUS_LABELS[status]}
            {compact ? <span className={styles.srOnly}>{PAYMENT_STATUS_LABELS[status]}</span> : null}
        </span>
    );
}

export interface PayableAssignment {
    id: string;
    title: string;
    createdAt?: number;
}

interface PaymentVideoPickerProps {
    assignments: PayableAssignment[];
    /** Bu kayıt dışındaki ödemelerden gelen durum. */
    otherPayments: Map<string, AssignmentPaymentSummary>;
    value: PaidAssignmentLink[];
    onChange: (links: PaidAssignmentLink[]) => void;
    disabled?: boolean;
}

export default function PaymentVideoPicker({ assignments, otherPayments, value, onChange, disabled }: PaymentVideoPickerProps) {
    const selected = new Map(value.map(link => [link.assignmentId, link.coverage]));

    const toggle = (assignmentId: string) => {
        if (selected.has(assignmentId)) {
            onChange(value.filter(link => link.assignmentId !== assignmentId));
        } else {
            onChange([...value, { assignmentId, coverage: 'full' }]);
        }
    };

    const setCoverage = (assignmentId: string, coverage: PaymentCoverage) => {
        onChange(value.map(link => link.assignmentId === assignmentId ? { ...link, coverage } : link));
    };

    if (assignments.length === 0) {
        return <p className={styles.empty}>Bu YouTuber’a atanmış video yok.</p>;
    }

    return (
        <div className={styles.list}>
            {assignments.map(assignment => {
                const coverage = selected.get(assignment.id);
                const otherStatus = getAssignmentPaymentStatus(otherPayments, assignment.id);
                return (
                    <div key={assignment.id} className={`${styles.row} ${coverage ? styles.rowSelected : ''}`}>
                        <label className={styles.rowMain}>
                            <input
                                type="checkbox"
                                checked={Boolean(coverage)}
                                onChange={() => toggle(assignment.id)}
                                disabled={disabled}
                            />
                            <span className={styles.rowText}>
                                <span className={styles.rowTitle}>{assignment.title}</span>
                                <span className={styles.rowMeta}>
                                    {assignment.createdAt ? format(new Date(assignment.createdAt), 'd MMM yyyy', { locale: tr }) : 'Tarih yok'}
                                    {otherStatus !== 'unpaid' && (
                                        <> · başka ödemede: <PaymentStatusBadge status={otherStatus} /></>
                                    )}
                                </span>
                            </span>
                        </label>
                        {coverage && (
                            <div className={styles.coverage} role="group" aria-label="Ödeme kapsamı">
                                <button
                                    type="button"
                                    className={coverage === 'full' ? styles.coverageFullActive : ''}
                                    onClick={() => setCoverage(assignment.id, 'full')}
                                    disabled={disabled}
                                >
                                    Tam
                                </button>
                                <button
                                    type="button"
                                    className={coverage === 'partial' ? styles.coveragePartialActive : ''}
                                    onClick={() => setCoverage(assignment.id, 'partial')}
                                    disabled={disabled}
                                >
                                    Kısmi
                                </button>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
