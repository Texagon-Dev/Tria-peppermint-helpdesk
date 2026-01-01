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
 * Synchronous version for simpler use cases.
 * Uses marked.parseSync() for robust markdown parsing.
 */
export function convertMarkdownToHtmlSync(text: string): string {
    if (!text || typeof text !== "string") {
        return text || "";
    }

    try {
        // Configure marked for email-safe output
        marked.setOptions({
            breaks: true, // Convert line breaks to <br>
            gfm: true, // GitHub Flavored Markdown
        });

        // Convert markdown to HTML using the synchronous method
        let html = marked.parseSync(text);

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
