/**
 * Convert markdown text to email-safe HTML.
 * This handles common markdown patterns from AI responses:
 * - **bold** → <strong>bold</strong>
 * - *italic* → <em>italic</em>
 * - Numbered lists → <ol><li>...</li></ol>
 * - Bullet lists → <ul><li>...</li></ul>
 * - Line breaks → <br>
 * - Links → <a href="...">...</a>
 * 
 * Uses simple regex-based conversion for synchronous operation
 * and compatibility with all Node.js versions.
 */
export function convertMarkdownToHtmlSync(text: string): string {
    if (!text || typeof text !== "string") {
        return text || "";
    }

    try {
        let html = text;

        // Bold: **text** or __text__
        html = html.replace(
            /\*\*([^*]+)\*\*/g,
            '<strong style="font-weight:bold;">$1</strong>'
        );
        html = html.replace(
            /__([^_]+)__/g,
            '<strong style="font-weight:bold;">$1</strong>'
        );

        // Italic: *text* or _text_ (but not inside URLs or already processed)
        html = html.replace(
            /(?<!\*)\*([^*]+)\*(?!\*)/g,
            '<em style="font-style:italic;">$1</em>'
        );

        // Links: [text](url)
        html = html.replace(
            /\[([^\]]+)\]\(([^)]+)\)/g,
            '<a href="$2" target="_blank" rel="noopener" style="color:#0066cc;">$1</a>'
        );

        // Email addresses: make them clickable (avoid matching already-linked emails)
        html = html.replace(
            /(?<!href="mailto:)(?<!>)([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(?!<\/a>)/g,
            '<a href="mailto:$1" style="color:#0066cc;">$1</a>'
        );

        // Process lists - split by lines for more accurate processing
        const lines = html.split('\n');
        const processedLines: string[] = [];
        let inOrderedList = false;
        let inUnorderedList = false;

        for (const line of lines) {
            const trimmedLine = line.trim();

            // Check for numbered list item: "1. ", "2. ", etc.
            const orderedMatch = trimmedLine.match(/^(\d+)\.\s+(.+)$/);
            // Check for bullet list item: "- " or "* "
            const unorderedMatch = trimmedLine.match(/^[-*]\s+(.+)$/);

            if (orderedMatch) {
                if (!inOrderedList) {
                    if (inUnorderedList) {
                        processedLines.push('</ul>');
                        inUnorderedList = false;
                    }
                    processedLines.push('<ol style="margin:10px 0;padding-left:20px;">');
                    inOrderedList = true;
                }
                processedLines.push(`<li style="margin:5px 0;">${orderedMatch[2]}</li>`);
            } else if (unorderedMatch) {
                if (!inUnorderedList) {
                    if (inOrderedList) {
                        processedLines.push('</ol>');
                        inOrderedList = false;
                    }
                    processedLines.push('<ul style="margin:10px 0;padding-left:20px;">');
                    inUnorderedList = true;
                }
                processedLines.push(`<li style="margin:5px 0;">${unorderedMatch[1]}</li>`);
            } else {
                // Close any open lists
                if (inOrderedList) {
                    processedLines.push('</ol>');
                    inOrderedList = false;
                }
                if (inUnorderedList) {
                    processedLines.push('</ul>');
                    inUnorderedList = false;
                }
                // Regular line
                if (trimmedLine) {
                    processedLines.push(line);
                } else {
                    processedLines.push('<br>');
                }
            }
        }

        // Close any remaining open lists
        if (inOrderedList) {
            processedLines.push('</ol>');
        }
        if (inUnorderedList) {
            processedLines.push('</ul>');
        }

        html = processedLines.join('\n');

        // Convert remaining line breaks to <br> (except after list items)
        html = html.replace(/(?<!<\/li>)\n(?!<[uo]l|<\/[uo]l>|<li)/g, '<br>\n');

        // Wrap paragraphs (text between double line breaks)
        html = html.replace(/<br>\n<br>/g, '</p><p style="margin:10px 0;">');

        // Clean up
        html = html.replace(/<br>\n+/g, '<br>');
        html = html.replace(/\n+/g, ' ');

        return html;
    } catch (error) {
        console.error("Error converting markdown to HTML:", error);
        // Fallback: return original text with basic HTML escaping and line breaks
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\n/g, "<br>");
    }
}

/**
 * Async version that wraps the sync function.
 * Kept for API compatibility.
 */
export async function convertMarkdownToHtml(text: string): Promise<string> {
    return convertMarkdownToHtmlSync(text);
}
