export interface StatusData {
    name: string;
    color: string;
    order: number;
}

export const DEFAULT_STATUSES_DATA: StatusData[] = [
    { name: "Trial Mod Sent", color: "#9880FF", order: 0 },
    { name: "Waiting Feedback", color: "#FFB300", order: 1 },
    { name: "Interested", color: "#6397F2", order: 2 },
    { name: "Needs Changes", color: "#F45F5B", order: 3 },
    { name: "Price Sent", color: "#A6AEBF", order: 4 },
    { name: "Payment Pending", color: "#FFC033", order: 5 },
    { name: "Paid / Waiting Start", color: "#4ADE80", order: 6 },
    { name: "In Progress", color: "#6397F2", order: 7 },
    { name: "Delivered", color: "#4ADE80", order: 8 },
    { name: "Waiting Video", color: "#E040FB", order: 9 },
    { name: "Completed", color: "#4ADE80", order: 10 },
    { name: "Old Customer", color: "#A6AEBF", order: 11 },
    { name: "Recontact Later", color: "#FFB300", order: 12 },
    { name: "Inactive / Lost", color: "#F45F5B", order: 13 },
    { name: "Do Not Contact", color: "#F45F5B", order: 14 }
];

export interface StatusStyle {
    bg: string;
    text: string;
    border: string;
}

// Safely convert Hex to RGBA format for modern transparency layers
export function hexToRgba(hex: string, alpha: number): string {
    // Basic fallback if invalid
    if (!hex || typeof hex !== 'string') return `rgba(92, 62, 240, ${alpha})`;
    
    let cleanHex = hex.replace('#', '');
    if (cleanHex.length === 3) {
        cleanHex = cleanHex[0] + cleanHex[0] + cleanHex[1] + cleanHex[1] + cleanHex[2] + cleanHex[2];
    }
    
    if (cleanHex.length !== 6) return `rgba(92, 62, 240, ${alpha})`;

    const r = parseInt(cleanHex.substring(0, 2), 16);
    const g = parseInt(cleanHex.substring(2, 4), 16);
    const b = parseInt(cleanHex.substring(4, 6), 16);
    
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Generate premium glassmorphic tag styles dynamically for any custom status color
export function getStatusStyle(color: string): StatusStyle {
    const hex = color && color.startsWith('#') ? color : '#5C3EF0';
    return {
        bg: hexToRgba(hex, 0.12),
        text: hex,
        border: `1px solid ${hexToRgba(hex, 0.3)}`
    };
}
