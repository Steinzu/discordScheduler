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
     * @param {string|Object} content - String for simple message, Object for advanced message with embeds
     * @param {number} retries
     * @returns {Promise<boolean>}
     */
    async sendMessage(content, retries = 3) {
        if (!this.webhookUrl) {
            throw new Error('No webhook URL set');
        }
        
        // Prepare the payload based on the content type
        let payload;
        if (typeof content === 'string') {
            // Simple text message
            if (!content.trim()) {
                throw new Error('Cannot send an empty message');
            }
            payload = { content };
        } else if (typeof content === 'object') {
            // Advanced message object
            payload = content;
            
            // Remove any timestamp from embeds to prevent "Today at XX:XX" display
            if (payload.embeds && payload.embeds.length > 0) {
                for (const embed of payload.embeds) {
                    if (embed.timestamp) {
                        delete embed.timestamp;
                    }
                }
            }
            
            // Validate that the message has content
            if (!payload.content?.trim() && 
                (!payload.embeds || 
                 payload.embeds.length === 0 || 
                 (!payload.embeds[0].description?.trim() && 
                  !payload.embeds[0].title?.trim() && 
                  !payload.embeds[0].fields?.length))) {
                throw new Error('Cannot send an empty message');
            }
        } else {
            throw new Error('Invalid message format');
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
                    body: JSON.stringify(payload)
                });

                if (response.status === 429) {
                    const rateLimitData = await response.json();
                    const retryAfter = (rateLimitData.retry_after || 1) * 1000;
                    this.log(`Rate limited, waiting ${retryAfter}ms before retry`);
                    await new Promise(resolve => setTimeout(resolve, retryAfter));
                    continue;
                }

                if (!response.ok) {
                    const errorText = await response.text();
                    let errorData;
                    try {
                        errorData = JSON.parse(errorText);
                    } catch (e) {
                        throw new Error(`Discord API error (${response.status}): ${errorText || response.statusText}`);
                    }
                    throw new Error(`Discord API error: ${errorData.message || response.statusText}`);
                }

                this.log('Message sent successfully');
                return true;
            } catch (error) {
                lastError = error;
                this.logError(`Error sending message (attempt ${attempt + 1})`, error);

                // Don't retry empty message errors
                if (error.message && (
                    error.message.includes('Cannot send an empty message') || 
                    error.message.includes('code: 50006'))) {
                    break;
                }

                await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
            }
        }

        throw lastError || new Error('Failed to send message after multiple attempts');
    }
}
