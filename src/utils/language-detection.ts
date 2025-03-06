import * as path from 'path';

/**
 * Maps file extensions to VS Code language identifiers
 */
export const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
    // Web development
    '.js': 'javascript',
    '.jsx': 'javascriptreact',
    '.ts': 'typescript',
    '.tsx': 'typescriptreact',
    '.html': 'html',
    '.htm': 'html',
    '.css': 'css',
    '.scss': 'scss',
    '.less': 'less',
    '.json': 'json',
    '.jsonc': 'jsonc',
    '.xml': 'xml',
    '.svg': 'xml',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.md': 'markdown',
    '.py': 'python',
    '.java': 'java',
    '.c': 'c',
    '.cpp': 'cpp',
    '.cs': 'csharp',
    '.go': 'go',
    '.rb': 'ruby',
    '.rs': 'rust',
    '.sh': 'shellscript',
    '.bash': 'shellscript',
    '.txt': 'plaintext',
    '.log': 'log'
};

/**
 * Detects language from filename and extension
 * 
 * @param fileName Original file name
 * @returns The detected language ID or 'plaintext' as fallback
 */
export function detectLanguageFromFileName(fileName: string): string {
    if (!fileName) {
        return 'plaintext';
    }

    // Check file extension
    const extension = path.extname(fileName).toLowerCase();
    if (extension && extension in EXTENSION_LANGUAGE_MAP) {
        return EXTENSION_LANGUAGE_MAP[extension];
    }

    // Check special files without extensions
    const baseName = path.basename(fileName).toLowerCase();
    const specialFiles: Record<string, string> = {
        'dockerfile': 'dockerfile',
        'makefile': 'makefile',
        'jenkinsfile': 'groovy',
        'vagrantfile': 'ruby',
        'package.json': 'json',
        'tsconfig.json': 'jsonc'
    };

    if (baseName in specialFiles) {
        return specialFiles[baseName];
    }

    return 'plaintext';
}

/**
 * Attempts to detect language from file content
 * 
 * @param content The file content as a string
 * @returns The detected language ID or 'plaintext' as fallback
 */
export function detectLanguageFromContent(content: string): string {
    if (!content) {
        return 'plaintext';
    }

    const trimmedContent = content.trim();

    // Check for XML/HTML
    if (trimmedContent.startsWith('<?xml') || trimmedContent.includes('<!DOCTYPE html') || trimmedContent.startsWith('<html')) {
        if (trimmedContent.includes('<!DOCTYPE html') || trimmedContent.startsWith('<html')) {
            return 'html';
        }
        return 'xml';
    }

    // Check for JSON
    if ((trimmedContent.startsWith('{') && trimmedContent.endsWith('}')) ||
        (trimmedContent.startsWith('[') && trimmedContent.endsWith(']'))) {
        try {
            JSON.parse(trimmedContent);
            return 'json';
        } catch (e) {
            // Not valid JSON
        }
    }

    // Check for JavaScript/TypeScript
    const jsPatterns = ['function ', 'const ', 'var ', 'let ', '=>', 'import ', 'export '];
    const tsPatterns = ['interface ', 'class ', 'enum ', 'namespace ', 'type '];

    let jsMatches = 0;
    let tsMatches = 0;

    jsPatterns.forEach(pattern => {
        if (content.includes(pattern)) jsMatches++;
    });

    tsPatterns.forEach(pattern => {
        if (content.includes(pattern)) tsMatches++;
    });

    if (tsMatches > 0) return 'typescript';
    if (jsMatches > 1) return 'javascript';

    return 'plaintext';
}

/**
 * Gets the best language ID for a file by using both filename and content analysis
 * 
 * @param fileName The file name
 * @param content The file content
 * @returns The best language ID match or 'plaintext' as fallback
 */
export function getLanguageId(fileName: string, content?: string): string {
    // First try by filename/extension
    const langByName = detectLanguageFromFileName(fileName);
    if (langByName && langByName !== 'plaintext') {
        return langByName;
    }

    // If content is provided and no specific language was detected from filename,
    // try to detect from content
    if (content) {
        const langByContent = detectLanguageFromContent(content);
        if (langByContent && langByContent !== 'plaintext') {
            return langByContent;
        }
    }

    // Default to plaintext if nothing else matches
    return 'plaintext';
}
