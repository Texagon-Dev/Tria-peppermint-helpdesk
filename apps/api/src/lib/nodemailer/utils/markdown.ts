import { marked, Renderer } from "marked";

/**
 * Create a custom renderer with email-safe inline styles.
 * This is more robust than regex post-processing as it handles
 * all edge cases during the rendering phase.
 */
function createEmailRenderer(): Renderer {
    const renderer = new Renderer();

    // Override link rendering to add target="_blank" and rel="noopener"
    renderer.link = ({ href, title, text }): string => {
        const titleAttr = title ? ` title="${title}"` : "";
        return `<a href="${href}" target="_blank" rel="noopener"${titleAttr} style="color:#0066cc;">${text}</a>`;
    };

    // Override paragraph with inline styles
    renderer.paragraph = ({ text }): string => {
        return `<p style="margin:10px 0;">${text}</p>\n`;
    };

    // Override strong (bold) with inline styles
    renderer.strong = ({ text }): string => {
        return `<strong style="font-weight:bold;">${text}</strong>`;
    };

    // Override em (italic) with inline styles
    renderer.em = ({ text }): string => {
        return `<em style="font-style:italic;">${text}</em>`;
    };

    // Override list with inline styles
    renderer.list = ({ ordered, items }): string => {
        const tag = ordered ? "ol" : "ul";
        const body = items.map(item => renderer.listitem(item)).join("");
        return `<${tag} style="margin:10px 0;padding-left:20px;">${body}</${tag}>\n`;
    };

    // Override list item with inline styles
    renderer.listitem = ({ text }): string => {
        return `<li style="margin:5px 0;">${text}</li>\n`;
    };

    return renderer;
}

/**
 * Configure marked with email-safe settings and custom renderer.
 */
function getConfiguredMarked() {
    marked.setOptions({
        breaks: true, // Convert line breaks to <br>
        gfm: true, // GitHub Flavored Markdown
    });
    marked.use({ renderer: createEmailRenderer() });
    return marked;
}

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
        const configuredMarked = getConfiguredMarked();
        return await configuredMarked.parse(text);
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
 * Uses marked.parse() which is synchronous when no async extensions are used.
 */
export function convertMarkdownToHtmlSync(text: string): string {
    if (!text || typeof text !== "string") {
        return text || "";
    }

    try {
        const configuredMarked = getConfiguredMarked();
        // marked.parse() is synchronous by default in marked v17
        // It only returns a Promise when async extensions are enabled
        return configuredMarked.parse(text) as string;
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
