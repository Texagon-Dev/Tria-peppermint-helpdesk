/**
 * Gmail OAuth placeholder constants
 * Used during the pending authorization phase
 */
export const GMAIL_PENDING_NAME = "Gmail (pending authorization)";
export const GMAIL_PENDING_EMAIL = "pending@gmail.com";

/**
 * Default fallback expiry offset for Gmail OAuth tokens (in seconds).
 * Used when the token response doesn't include an explicit expiry_date.
 * Set to 3500 seconds (~58 minutes), giving a ~2 minute buffer before the typical 1-hour expiry.
 */
export const GMAIL_DEFAULT_EXPIRY_OFFSET_SECONDS = 3500;

/**
 * Threshold for detecting if a timestamp is in milliseconds vs seconds.
 * Timestamps greater than this value (10 billion seconds ~ year 2286) are assumed to be in milliseconds.
 * Using 10 billion ensures we correctly detect millisecond timestamps while avoiding false positives.
 */
export const MILLISECONDS_TIMESTAMP_DETECTION_THRESHOLD = 10_000_000_000;

/**
 * Normalizes OAuth token expiry timestamps to seconds.
 * Handles inconsistent timestamp formats from OAuth providers (milliseconds vs seconds).
 *
 * @param value - The expiry timestamp value (may be in seconds or milliseconds)
 * @returns The expiry timestamp in seconds (Unix epoch)
 *
 * @example
 * // Milliseconds timestamp (year 2025)
 * normalizeExpiryToSeconds(1735641600000) // Returns 1735641600
 *
 * // Seconds timestamp (year 2025)
 * normalizeExpiryToSeconds(1735641600) // Returns 1735641600
 */
export function normalizeExpiryToSeconds(value: number | bigint): number {
    const numValue = typeof value === 'bigint' ? Number(value) : value;

    // If it looks like a millisecond epoch timestamp, convert to seconds
    if (numValue > MILLISECONDS_TIMESTAMP_DETECTION_THRESHOLD) {
        return Math.floor(numValue / 1000);
    }

    return numValue;
}
