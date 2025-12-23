import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';

// PDFKit uses CommonJS exports, need to use require
const PDFDocument = require('pdfkit');

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

export interface ExportOptions {
    projectName: string;
    conversationId: string;
    messages: ChatMessage[];
    format: 'pdf' | 'docx';
}

/**
 * Export chat conversation to PDF
 */
export async function exportToPDF(options: ExportOptions): Promise<Buffer> {
    const { projectName, messages } = options;

    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({
                size: 'A4',
                margins: { top: 50, bottom: 50, left: 50, right: 50 },
            });

            const chunks: Buffer[] = [];
            doc.on('data', (chunk: Buffer) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            // Header
            doc.fontSize(20).font('Helvetica-Bold').text('Chat Conversation Export', { align: 'center' });
            doc.moveDown(0.5);
            doc.fontSize(12).font('Helvetica').text(`Project: ${projectName}`, { align: 'center' });
            doc.fontSize(10).text(`Exported: ${new Date().toLocaleString()}`, { align: 'center' });
            doc.moveDown(1);

            // Add separator line
            doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
            doc.moveDown(1);

            // Messages
            messages.forEach((message, index) => {
                const isUser = message.role === 'user';
                const timestamp = new Date(message.timestamp).toLocaleString();

                // Check if we need a new page
                if (doc.y > 700) {
                    doc.addPage();
                }

                // Message header
                doc.fontSize(11)
                    .font('Helvetica-Bold')
                    .fillColor(isUser ? '#2563eb' : '#059669')
                    .text(isUser ? 'You' : 'Avi AI', { continued: false });

                doc.fontSize(8)
                    .font('Helvetica')
                    .fillColor('#6b7280')
                    .text(timestamp, { align: 'right' });

                doc.moveDown(0.3);

                // Message content
                doc.fontSize(10)
                    .font('Helvetica')
                    .fillColor('#000000')
                    .text(message.content, {
                        align: 'left',
                        lineGap: 2,
                    });

                doc.moveDown(0.8);

                // Separator between messages
                if (index < messages.length - 1) {
                    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeOpacity(0.2).stroke().strokeOpacity(1);
                    doc.moveDown(0.8);
                }
            });

            // Footer
            const pageCount = doc.bufferedPageRange().count;
            for (let i = 0; i < pageCount; i++) {
                doc.switchToPage(i);
                doc.fontSize(8)
                    .fillColor('#6b7280')
                    .text(
                        `Page ${i + 1} of ${pageCount}`,
                        50,
                        doc.page.height - 30,
                        { align: 'center' }
                    );
            }

            doc.end();
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Export chat conversation to DOCX
 */
export async function exportToDOCX(options: ExportOptions): Promise<Buffer> {
    const { projectName, messages } = options;

    const docParagraphs: Paragraph[] = [];

    // Title
    docParagraphs.push(
        new Paragraph({
            text: 'Chat Conversation Export',
            heading: HeadingLevel.HEADING_1,
            spacing: { after: 200 },
        })
    );

    // Metadata
    docParagraphs.push(
        new Paragraph({
            children: [
                new TextRun({
                    text: `Project: ${projectName}`,
                    bold: true,
                }),
            ],
            spacing: { after: 100 },
        })
    );

    docParagraphs.push(
        new Paragraph({
            children: [
                new TextRun({
                    text: `Exported: ${new Date().toLocaleString()}`,
                    size: 20,
                    color: '666666',
                }),
            ],
            spacing: { after: 400 },
        })
    );

    // Messages
    messages.forEach((message, index) => {
        const isUser = message.role === 'user';
        const timestamp = new Date(message.timestamp).toLocaleString();

        // Message header
        docParagraphs.push(
            new Paragraph({
                children: [
                    new TextRun({
                        text: isUser ? 'You' : 'Avi AI',
                        bold: true,
                        color: isUser ? '2563eb' : '059669',
                        size: 24,
                    }),
                    new TextRun({
                        text: ` • ${timestamp}`,
                        size: 18,
                        color: '6b7280',
                    }),
                ],
                spacing: { before: index === 0 ? 0 : 300, after: 100 },
            })
        );

        // Message content
        docParagraphs.push(
            new Paragraph({
                text: message.content,
                spacing: { after: 200 },
            })
        );
    });

    const doc = new Document({
        sections: [
            {
                properties: {},
                children: docParagraphs,
            },
        ],
    });

    return await Packer.toBuffer(doc);
}

/**
 * Main export function
 */
export async function exportChat(options: ExportOptions): Promise<Buffer> {
    if (options.format === 'pdf') {
        return exportToPDF(options);
    } else if (options.format === 'docx') {
        return exportToDOCX(options);
    } else {
        throw new Error(`Unsupported export format: ${options.format}`);
    }
}
