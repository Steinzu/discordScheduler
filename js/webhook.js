class DiscordWebhook {
    constructor() {
        // Hardcoded webhook URL - replace with your Discord webhook URL
        this.webhookUrl = 'YOUR_DISCORD_WEBHOOK_URL';
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
