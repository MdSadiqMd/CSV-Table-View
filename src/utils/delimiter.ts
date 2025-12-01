/**
 * Utility functions for CSV delimiter detection
 */

export interface DelimiterResult {
    delimiter: string;
    confidence: number;
}

/**
 * Auto-detect the delimiter used in a CSV file
 * @param sample Sample of the CSV content (first few lines)
 * @param configuredDelimiter Delimiter from configuration
 * @returns The detected delimiter or the configured one
 */
export function detectDelimiter(
    sample: string,
    configuredDelimiter: string = 'auto'
): string {
    if (configuredDelimiter !== 'auto') {
        return configuredDelimiter === '\\t' ? '\t' : configuredDelimiter;
    }

    const delimiters = [',', ';', '\t', '|'];
    const scores: Map<string, number> = new Map();

    // Take first 5 lines for analysis
    const lines = sample.split('\n').slice(0, 5).filter(line => line.trim());

    if (lines.length === 0) {
        return ','; // Default to comma
    }

    for (const delimiter of delimiters) {
        const counts: number[] = [];

        for (const line of lines) {
            // Skip quoted sections when counting
            const count = countDelimiterOccurrences(line, delimiter);
            counts.push(count);
        }

        // Check consistency: all lines should have similar delimiter count
        if (counts.length > 1) {
            const first = counts[0];
            const allSame = counts.every(c => c === first);
            const hasDelimiters = first > 0;

            if (allSame && hasDelimiters) {
                // Higher score for consistent delimiter count across lines
                scores.set(delimiter, first * 100);
            } else if (hasDelimiters) {
                // Lower score if counts vary but delimiter exists
                scores.set(delimiter, first * 10);
            } else {
                scores.set(delimiter, 0);
            }
        } else if (counts.length === 1) {
            scores.set(delimiter, counts[0]);
        }
    }

    // Find delimiter with highest score
    let bestDelimiter = ',';
    let bestScore = 0;

    for (const [delimiter, score] of scores.entries()) {
        if (score > bestScore) {
            bestScore = score;
            bestDelimiter = delimiter;
        }
    }

    return bestDelimiter;
}

/**
 * Count delimiter occurrences outside of quoted strings
 */
function countDelimiterOccurrences(line: string, delimiter: string): number {
    let count = 0;
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            // Handle escaped quotes
            if (i + 1 < line.length && line[i + 1] === '"') {
                i++; // Skip next quote
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === delimiter && !inQuotes) {
            count++;
        }
    }

    return count;
}

/**
 * Get a human-readable name for a delimiter
 */
export function getDelimiterName(delimiter: string): string {
    switch (delimiter) {
        case ',':
            return 'Comma';
        case ';':
            return 'Semicolon';
        case '\t':
            return 'Tab';
        case '|':
            return 'Pipe';
        default:
            return 'Custom';
    }
}
