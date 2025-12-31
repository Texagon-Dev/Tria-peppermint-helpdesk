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
 * Timestamps greater than this value (3 billion seconds ~ year 2065) are assumed to be in milliseconds.
 * Used to handle inconsistent timestamp formats from OAuth providers.
 */
export const MILLISECONDS_TIMESTAMP_DETECTION_THRESHOLD = 3000000000;
