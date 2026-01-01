import { marked } from "marked";

// Configure marked once at module initialization
marked.setOptions({
    breaks: true, // Convert line breaks to <br>
    gfm: true, // GitHub Flavored Markdown
});

/**
 * Convert markdown text to email-safe HTML.
 * This handles common markdown patterns from AI responses:
 * - **bold** → <strong>bold</strong>
 * - *italic* → <em>italic</em>
 * - Numbered lists → <ol><li>...</li></ol>
 * - Bullet lists → <ul><li>...</li></ul>
 * - Line breaks → <br>
 * - Links → <a href="..." target="_blank">...</a>
 */
export async function convertMarkdownToHtml(text: string): Promise<string> {
    if (!text || typeof text !== "string") {
        return text || "";
    }

    try {
        // Convert markdown to HTML
        let html = await marked.parse(text);

        // Post-process for email compatibility
        html = addEmailStyles(html);

        return html;
    } catch (error) {
        console.error("Error converting markdown to HTML:", error);
        return escapeAndFormat(text);
    }
}

/**
 * Synchronous version for simpler use cases.
 */
export function convertMarkdownToHtmlSync(text: string): string {
    if (!text || typeof text !== "string") {
        return text || "";
    }

    try {
        // marked.parse() is synchronous by default when no async extensions are used
        const result = marked.parse(text);

        // Handle both sync and async return types
        if (typeof result === "string") {
            return addEmailStyles(result);
        }

        // If we got a Promise unexpectedly, fall back to manual conversion
        console.warn("marked.parse returned a Promise unexpectedly, using fallback");
        return manualMarkdownConvert(text);
    } catch (error) {
        console.error("Error converting markdown to HTML:", error);
        return escapeAndFormat(text);
    }
}

/**
 * Add inline styles for email client compatibility.
 * Email clients often strip external CSS, so we need inline styles.
 */
function addEmailStyles(html: string): string {
    return html
        // Ensure links open in new tab (for webmail clients)
        .replace(/<a href="/g, '<a target="_blank" rel="noopener" href="')
        // Add inline styles for better email rendering
        .replace(/<strong>/g, '<strong style="font-weight:bold;">')
        .replace(/<em>/g, '<em style="font-style:italic;">')
        .replace(/<ul>/g, '<ul style="margin:10px 0;padding-left:20px;">')
        .replace(/<ol>/g, '<ol style="margin:10px 0;padding-left:20px;">')
        .replace(/<li>/g, '<li style="margin:5px 0;">')
        .replace(/<p>/g, '<p style="margin:10px 0;">');
}

/**
 * Manual markdown conversion as fallback.
 * Used when marked library fails or returns unexpected types.
 */
function manualMarkdownConvert(text: string): string {
    let html = text;

    // Bold: **text** or __text__
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong style="font-weight:bold;">$1</strong>');
    html = html.replace(/__([^_]+)__/g, '<strong style="font-weight:bold;">$1</strong>');

    // Italic: *text* or _text_ (careful not to match bold)
    html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em style="font-style:italic;">$1</em>');
    html = html.replace(/(?<!_)_([^_]+)_(?!_)/g, '<em style="font-style:italic;">$1</em>');

    // Links: [text](url)
    html = html.replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener" style="color:#0066cc;">$1</a>'
    );

    // Numbered lists: lines starting with "1. ", "2. ", etc.
    html = html.replace(/^(\d+)\.\s+(.+)$/gm, '<li style="margin:5px 0;">$2</li>');

    // Bullet lists: lines starting with "- " or "* "
    html = html.replace(/^[-*]\s+(.+)$/gm, '<li style="margin:5px 0;">$1</li>');

    // Wrap consecutive <li> items
    html = html.replace(
        /(<li[^>]*>[\s\S]*?<\/li>(\s*<li[^>]*>[\s\S]*?<\/li>)*)/g,
        '<ul style="margin:10px 0;padding-left:20px;">$1</ul>'
    );

    // Line breaks
    html = html.replace(/\n/g, "<br>");

    // Clean up
    html = html.replace(/<br><br>/g, "<br>");
    html = html.replace(/<\/li><br>/g, "</li>");
    html = html.replace(/<\/ul><br>/g, "</ul>");

    return html;
}

/**
 * Fallback: escape HTML and convert line breaks.
 */
function escapeAndFormat(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br>");
}
