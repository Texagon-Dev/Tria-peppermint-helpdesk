import { ImapService } from "./services/imap.service";

// Lock to prevent overlapping email fetches (which cause race conditions with token refresh)
let isFetching = false;

export const getEmails = async (): Promise<void> => {
  // Skip if already fetching - prevents race conditions with OAuth token refresh
  if (isFetching) {
    console.log('Email fetch skipped - previous fetch still in progress');
    return;
  }

  isFetching = true;
  try {
    await ImapService.fetchEmails();
    console.log('Email fetch completed');
  } catch (error) {
    console.error('An error occurred while fetching emails:', error);
  } finally {
    isFetching = false;
  }
};

