class DiscordWebhook {
    constructor() {
        this.webhookUrl = 'https://discord.com/api/webhooks/1366721932980125696/JkxU-96B0XKTD-m9bFFIcwD_EcxYsCHGFeOdkRCt7qsWilsatChzvAC8qXBzRWzadt9u';
    }

    getWebhookUrl() {
        return this.webhookUrl;
    }

    isValidWebhookUrl(url) {
        // Basic validation for Discord webhook URL
        return url.startsWith('https://discord.com/api/webhooks/') || 
               url.startsWith('https://discordapp.com/api/webhooks/');
    }

    async sendMessage(content) {
        if (!this.webhookUrl) {
            throw new Error('No webhook URL set');
        }

        try {
            const response = await fetch(this.webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    content: content
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Discord API error: ${errorData.message || response.statusText}`);
            }

            return true;
        } catch (error) {
            console.error('Error sending message:', error);
            throw error;
        }
    }
}
