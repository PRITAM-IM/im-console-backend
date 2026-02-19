/**
 * 2Chat WhatsApp Service
 * Handles sending WhatsApp messages via 2Chat API
 */

const TWOCHAT_API_BASE_URL = 'https://api.p.2chat.io/open';

interface SendMessageParams {
    phone?: string;
    groupId?: string;
    text: string;
}

interface SendMessageResponse {
    success: boolean;
    messageId?: string;
    error?: string;
}

class TwoChatService {
    private apiKey: string;

    constructor() {
        this.apiKey = process.env.TWOCHAT_API_KEY || '';

        if (!this.apiKey) {
            console.warn('[2Chat Service] API key not configured');
        }
    }

    /**
     * Send a text message to a WhatsApp number or group
     */
    async sendMessage(params: SendMessageParams): Promise<SendMessageResponse> {
        if (!this.apiKey) {
            return {
                success: false,
                error: '2Chat API key not configured',
            };
        }

        const { phone, groupId, text } = params;

        if (!phone && !groupId) {
            return {
                success: false,
                error: 'Either phone or groupId must be provided',
            };
        }

        try {
            console.log(`[2Chat Service] Sending message to ${groupId ? `group ${groupId}` : `phone ${phone}`}`);

            const fromNumber = process.env.TWOCHAT_FROM_NUMBER || '918130200467';

            const payload: any = {
                from_number: fromNumber,
                text,
            };

            if (groupId) {
                payload.to_group_uuid = groupId;
            } else {
                payload.to_number = phone;
            }

            const response = await fetch(`${TWOCHAT_API_BASE_URL}/whatsapp/send-message`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-User-API-Key': this.apiKey,
                },
                body: JSON.stringify(payload),
            });

            const data = await response.json() as any;

            if (!response.ok) {
                console.error('[2Chat Service] API error:', data);
                return {
                    success: false,
                    error: data.message || `HTTP ${response.status}`,
                };
            }

            console.log('[2Chat Service] Message sent successfully:', data.id);

            return {
                success: true,
                messageId: data.id,
            };
        } catch (error: any) {
            console.error('[2Chat Service] Error sending message:', error);
            return {
                success: false,
                error: error.message,
            };
        }
    }

    /**
     * Send a low balance alert to WhatsApp group
     */
    async sendLowBalanceAlert(params: {
        groupId: string;
        projectName: string;
        accountName: string;
        balance: number;
        currency: string;
        threshold: number;
        projectId: string;
    }): Promise<SendMessageResponse> {
        const { groupId, projectName, accountName, balance, currency, threshold, projectId } = params;

        const currencySymbol = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : currency;

        const message = `🚨 *LOW BALANCE ALERT*

*Hotel/Project:* ${projectName}
*Meta Ads Account:* ${accountName}
*Available Funds:* ${currencySymbol}${balance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
*Threshold:* ${currencySymbol}${threshold.toLocaleString('en-IN')}

⚠️ Meta Ads account running low!
Please recharge immediately to avoid campaign interruptions.

_Project ID: ${projectId}_`;

        return this.sendMessage({
            groupId,
            text: message,
        });
    }

    /**
     * Test connection by sending a test message
     */
    async testConnection(groupId: string): Promise<SendMessageResponse> {
        return this.sendMessage({
            groupId,
            text: '✅ 2Chat WhatsApp integration is working!\n\nBalance alert system is now active.',
        });
    }
}

export default new TwoChatService();
