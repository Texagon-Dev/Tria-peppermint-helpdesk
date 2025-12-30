
/**
 * Removes the Peppermint branding footer from email HTML.
 * Matches the table containing "Peppermint Ticket Management" and removes it.
 */
export function removeEmailFooter(html: string): string {
    if (!html) return html;

    // Regex to match the specific footer table containing the branding
    // We match <table...> ... Peppermint Ticket Management ... </table>
    const footerRegex = /<table[^>]*>[\s\S]*?Peppermint Ticket Management[\s\S]*?<\/table>/gi;

    return html.replace(footerRegex, "");
}
