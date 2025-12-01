/**
 * CSV parsing utilities using PapaParse
 */
import * as Papa from 'papaparse';

export interface ParseResult {
    data: string[][];
    headers: string[];
    totalRows: number;
    errors: ParseError[];
}

export interface ParseError {
    type: string;
    code: string;
    message: string;
    row?: number;
}

export interface ParseOptions {
    delimiter?: string;
    maxRows?: number;
    skipEmptyLines?: boolean;
}

/**
 * Parse CSV content into a structured format
 * @param content CSV file content as string
 * @param options Parse options
 * @returns Parsed result with data and metadata
 */
export function parseCSV(
    content: string,
    options: ParseOptions = {}
): ParseResult {
    const {
        delimiter,
        maxRows = 10000,
        skipEmptyLines = true
    } = options;

    const parseResult = Papa.parse<string[]>(content, {
        delimiter: delimiter,
        skipEmptyLines: skipEmptyLines ? 'greedy' : false,
        preview: maxRows > 0 ? maxRows + 1 : 0, // +1 for header
        quoteChar: '"',
        escapeChar: '"',
        comments: false,
        header: false,
        dynamicTyping: false,
        transformHeader: undefined,
        transform: undefined
    });

    const allRows = parseResult.data;
    const headers = allRows.length > 0 ? allRows[0] : [];
    const data = allRows.slice(1);

    const errors: ParseError[] = parseResult.errors.map((err: any) => ({
        type: err.type,
        code: err.code,
        message: err.message,
        row: err.row
    }));

    return {
        data,
        headers,
        totalRows: data.length,
        errors
    };
}

/**
 * Estimate the total number of rows in a CSV without parsing everything
 */
export function estimateRowCount(content: string): number {
    // Count newlines in a sample
    const sampleSize = Math.min(content.length, 10000);
    const sample = content.substring(0, sampleSize);
    const newlinesInSample = (sample.match(/\n/g) || []).length;

    if (newlinesInSample === 0) {
        return 1;
    }

    // Extrapolate to full content
    const estimatedTotal = Math.floor((content.length / sampleSize) * newlinesInSample);
    return Math.max(1, estimatedTotal);
}

/**
 * Get a sample of the CSV content for delimiter detection
 */
export function getSample(content: string, lines: number = 10): string {
    const lineArray = content.split('\n').slice(0, lines);
    return lineArray.join('\n');
}

/**
 * Validate CSV structure
 */
export function validateCSV(parseResult: ParseResult): {
    valid: boolean;
    message?: string;
} {
    if (parseResult.headers.length === 0) {
        return {
            valid: false,
            message: 'CSV file appears to be empty or has no headers'
        };
    }

    if (parseResult.data.length === 0) {
        return {
            valid: false,
            message: 'CSV file has headers but no data rows'
        };
    }

    // Check if all rows have consistent column count
    const expectedColumns = parseResult.headers.length;
    const inconsistentRows = parseResult.data.filter(
        row => row.length !== expectedColumns
    );

    if (inconsistentRows.length > parseResult.data.length * 0.1) {
        return {
            valid: false,
            message: `Many rows have inconsistent column counts. Expected ${expectedColumns} columns.`
        };
    }

    return { valid: true };
}
