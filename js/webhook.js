class DiscordWebhook {
    constructor() {
        this.webhookUrl = 'https://discord.com/api/webhooks/1366721932980125696/JkxU-96B0XKTD-m9bFFIcwD_EcxYsCHGFeOdkRCt7qsWilsatChzvAC8qXBzRWzadt9u';
        this.debug = true;
    }

    /**
     * Get the webhook URL
     * @returns {string}
     */
    getWebhookUrl() {
        return this.webhookUrl;
    }

    /**
     * Set the webhook URL
     * @param {string} url
     */
    setWebhookUrl(url) {
        if (this.isValidWebhookUrl(url)) {
            this.webhookUrl = url;
            return true;
        }
        return false;
    }

    /**
     * Check if a webhook URL is valid
     * @param {string} url
     * @returns {boolean}
     */
    isValidWebhookUrl(url) {
        if (!url) return false;
        
        return url.startsWith('https://discord.com/api/webhooks/') || 
               url.startsWith('https://discordapp.com/api/webhooks/');
    }

    /**
     * Log messages in debug mode
     * @param {string} message
     * @param {Object} data
     */
    log(message, data = null) {
        if (this.debug) {
            if (data) {
                console.log(`[Discord] ${message}`, data);
            } else {
                console.log(`[Discord] ${message}`);
            }
        }
    }

    /**
     * Log errors
     * @param {string} message
     * @param {Error|Object} error
     */
    logError(message, error) {
        console.error(`[Discord Error] ${message}`, error);
    }

    /**
     * Send a message to Discord with retry logic
     * @param {string} content
     * @param {number} retries
     * @returns {Promise<boolean>}
     */
    async sendMessage(content, retries = 3) {
        if (!this.webhookUrl) {
            throw new Error('No webhook URL set');
        }
        let lastError;
        
        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                this.log(`Sending message (attempt ${attempt + 1}/${retries})`);
                
                const response = await fetch(this.webhookUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        content: content
                    })
                });

                if (response.status === 429) {
                    const rateLimitData = await response.json();
                    const retryAfter = (rateLimitData.retry_after || 1) * 1000;
                    this.log(`Rate limited, waiting ${retryAfter}ms before retry`);
                    await new Promise(resolve => setTimeout(resolve, retryAfter));
                    continue;
                }

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(`Discord API error: ${errorData.message || response.statusText}`);
                }

                this.log('Message sent successfully');
                return true;
            } catch (error) {
                lastError = error;
                this.logError(`Error sending message (attempt ${attempt + 1})`, error);

                await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
            }
        }

        throw lastError || new Error('Failed to send message after multiple attempts');
    }
}
