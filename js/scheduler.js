class MessageScheduler {
    constructor(webhook, githubManager) {
        this.webhook = webhook;
        this.githubManager = githubManager;
        this.messages = [];
        this.isRunning = false;
    }

    async init() {
        try {
            this.messages = await this.githubManager.fetchScheduledMessages();
        } catch (error) {
            console.error('Failed to fetch messages from GitHub:', error);
            this.triggerEvent('saveError', { error });
        }
    }

    async scheduleMessage(content, scheduledTime) {
        const newMessage = {
            id: Date.now().toString(),
            content: content,
            scheduledTime: scheduledTime,
            created: new Date().toISOString(),
            sent: false
        };

        this.messages.push(newMessage);
        await this.saveMessages();
        return newMessage;
    }

    getAllMessages() {
        return this.messages;
    }

    async deleteMessage(id) {
        this.messages = this.messages.filter(msg => msg.id !== id);
        await this.saveMessages();
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
}
