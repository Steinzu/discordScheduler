class MessageScheduler {
    constructor(webhook, githubManager) {
        this.webhook = webhook;
        this.githubManager = githubManager;
        this.messages = [];
        this.isRunning = false;
        this.refreshInterval = null;
        this.lastFetchTime = 0;
    }

    async init() {
        try {
            await this.refreshMessages();
            
            // Set up periodic refresh (every 60 seconds)
            this.refreshInterval = setInterval(() => this.refreshMessages(), 60000);
            
            // Start checking for messages to send
            this.startMessageCheck();
        } catch (error) {
            console.error('Failed to initialize scheduler:', error);
            this.triggerEvent('saveError', { error });
        }
    }
    
    async refreshMessages() {
        try {
            // Only fetch if authenticated
            if (!this.githubManager.isAuthenticated()) return;
            
            // Prevent too frequent refreshes
            const now = Date.now();
            if (now - this.lastFetchTime < 10000) return; // Minimum 10 seconds between refreshes
            
            this.lastFetchTime = now;
            const newMessages = await this.githubManager.fetchScheduledMessages();
            
            // Check if messages have changed
            if (JSON.stringify(this.messages) !== JSON.stringify(newMessages)) {
                this.messages = newMessages;
                this.triggerEvent('messagesUpdated', { messages: this.messages });
            }
        } catch (error) {
            console.error('Failed to refresh messages:', error);
        }
    }

    async scheduleMessage(content, scheduledTime) {
        const newMessage = {
            id: Date.now().toString(),
            content: content,
            scheduledTime: scheduledTime,
            created: new Date().toISOString()
        };

        this.messages.push(newMessage);
        await this.saveMessages();
        return newMessage;
    }

    getAllMessages() {
        // Filter out any messages that might have been sent but not yet removed
        return this.messages;
    }

    async deleteMessage(id) {
        this.messages = this.messages.filter(msg => msg.id !== id);
        await this.saveMessages();
    }

    startMessageCheck() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        this.checkScheduledMessages();
        
        // Check every 30 seconds for messages to send
        setInterval(() => this.checkScheduledMessages(), 30000);
    }
    
    async checkScheduledMessages() {
        if (!this.githubManager.isAuthenticated() || !this.webhook.getWebhookUrl()) return;
        
        const now = new Date();
        const messagesToSend = this.messages.filter(msg => 
            new Date(msg.scheduledTime) <= now
        );
        
        if (messagesToSend.length > 0) {
            console.log(`Found ${messagesToSend.length} messages to send`);
            
            for (const message of messagesToSend) {
                try {
                    await this.webhook.sendMessage(message.content);
                    
                    // Remove the sent message from the list
                    this.messages = this.messages.filter(msg => msg.id !== message.id);
                    
                    // Notify UI
                    this.triggerEvent('messageSent', { messageId: message.id });
                    
                } catch (error) {
                    console.error(`Error sending message ${message.id}:`, error);
                    this.triggerEvent('messageError', { messageId: message.id, error });
                }
            }
            
            // Save the updated messages (with sent messages removed)
            await this.saveMessages();
        }
    }

    async saveMessages() {
        try {
            await this.githubManager.saveScheduledMessages(this.messages);
        } catch (error) {
            console.error('Failed to save messages to GitHub:', error);
            this.triggerEvent('saveError', { error });
        }
    }

    triggerEvent(eventName, data) {
        const event = new CustomEvent(eventName, { detail: data });
        document.dispatchEvent(event);
    }
    
    destroy() {
        // Clean up
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
    }
}
