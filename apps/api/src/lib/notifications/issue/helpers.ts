/**
 * Gets all followers of a ticket, ensuring the creator is included if not already a follower.
 *
 * @param ticket - The ticket object containing following array and createdBy info
 * @returns Array of unique user IDs following the ticket
 */
export function getTicketFollowers(ticket: any): string[] {
    const baseFollowers = Array.isArray(ticket.following) ? [...ticket.following] : [];
    const creatorId = ticket.createdBy?.id;

    if (creatorId && !baseFollowers.includes(creatorId)) {
        baseFollowers.push(creatorId);
    }

    return baseFollowers;
}
