import { marked } from "marked";

/**
 * Convert markdown text to email-safe HTML.
 * This handles common markdown patterns from AI responses:
 * - **bold** → <strong>bold</strong>
 * - *italic* → <em>italic</em>
 * - Numbered lists → <ol><li>...</li></ol>
 * - Bullet lists → <ul><li>...</li></ul>
 * - Line breaks → <br>
 * - Links → <a href="...">...</a>
 */
export async function convertMarkdownToHtml(text: string): Promise<string> {
    if (!text || typeof text !== "string") {
        return text || "";
    }

    try {
        // Configure marked for email-safe output
        marked.setOptions({
            breaks: true, // Convert line breaks to <br>
            gfm: true, // GitHub Flavored Markdown
        });

        // Convert markdown to HTML
        let html = await marked.parse(text);

        // Post-process for email compatibility:
        // 1. Ensure links open in new tab (for webmail clients)
        html = html.replace(/<a href="/g, '<a target="_blank" href="');

        // 2. Add basic inline styles for better email rendering
        // (Email clients often strip external CSS)
        html = html.replace(/<strong>/g, '<strong style="font-weight:bold;">');
        html = html.replace(/<em>/g, '<em style="font-style:italic;">');
        html = html.replace(
            /<ul>/g,
            '<ul style="margin:10px 0;padding-left:20px;">'
        );
        html = html.replace(
            /<ol>/g,
            '<ol style="margin:10px 0;padding-left:20px;">'
        );
        html = html.replace(/<li>/g, '<li style="margin:5px 0;">');
        html = html.replace(/<p>/g, '<p style="margin:10px 0;">');

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
 * Synchronous version for simpler use cases
 */
export function convertMarkdownToHtmlSync(text: string): string {
    if (!text || typeof text !== "string") {
        return text || "";
    }

    try {
        // Use marked.parseInline for synchronous conversion
        // This handles inline markdown but not block-level elements
        let html = text;

        // Manual conversions for common patterns:
        // Bold: **text** or __text__
        html = html.replace(
            /\*\*([^*]+)\*\*/g,
            '<strong style="font-weight:bold;">$1</strong>'
        );
        html = html.replace(
            /__([^_]+)__/g,
            '<strong style="font-weight:bold;">$1</strong>'
        );

        // Italic: *text* or _text_
        html = html.replace(
            /\*([^*]+)\*/g,
            '<em style="font-style:italic;">$1</em>'
        );
        html = html.replace(/_([^_]+)_/g, '<em style="font-style:italic;">$1</em>');

        // Links: [text](url)
        html = html.replace(
            /\[([^\]]+)\]\(([^)]+)\)/g,
            '<a href="$2" target="_blank" style="color:#0066cc;">$1</a>'
        );

        // Email links: make emails clickable
        html = html.replace(
            /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
            '<a href="mailto:$1" style="color:#0066cc;">$1</a>'
        );

        // Numbered lists: lines starting with "1. ", "2. ", etc.
        const numberedListRegex = /^(\d+)\.\s+(.+)$/gm;
        if (numberedListRegex.test(html)) {
            html = html.replace(numberedListRegex, '<li style="margin:5px 0;">$2</li>');
            // Wrap consecutive <li> items in <ol> (using [\s\S] instead of 's' flag for ES5 compat)
            html = html.replace(
                /(<li[^>]*>[\s\S]*?<\/li>(\s*<li[^>]*>[\s\S]*?<\/li>)*)/g,
                '<ol style="margin:10px 0;padding-left:20px;">$1</ol>'
            );
        }

        // Bullet lists: lines starting with "- " or "* "
        const bulletListRegex = /^[-*]\s+(.+)$/gm;
        if (bulletListRegex.test(html)) {
            html = html.replace(bulletListRegex, '<li style="margin:5px 0;">$1</li>');
            // Wrap consecutive <li> items in <ul> (using [\s\S] instead of 's' flag for ES5 compat)
            html = html.replace(
                /(<li[^>]*>[\s\S]*?<\/li>(\s*<li[^>]*>[\s\S]*?<\/li>)*)/g,
                '<ul style="margin:10px 0;padding-left:20px;">$1</ul>'
            );
        }

        // Line breaks: \n to <br>
        html = html.replace(/\n/g, "<br>");

        // Clean up double <br> from list processing
        html = html.replace(/<br><br>/g, "<br>");
        html = html.replace(/<\/li><br>/g, "</li>");
        html = html.replace(/<\/ol><br>/g, "</ol>");
        html = html.replace(/<\/ul><br>/g, "</ul>");

        return html;
    } catch (error) {
        console.error("Error converting markdown to HTML:", error);
        return text.replace(/\n/g, "<br>");
    }
}
