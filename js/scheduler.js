/**
 * Enhanced Message Scheduler
 * Handles scheduling, storing, and sending messages with improved reliability
 */
class MessageScheduler {
    constructor(webhook, githubManager) {
        this.webhook = webhook;
        this.githubManager = githubManager;
        this.messages = [];
        this.isRunning = false;
        this.refreshInterval = null;
        this.lastFetchTime = 0;
        this.lastSaveTime = 0;
        this.pendingSave = false;
        this.debug = true;
    }

    /**
     * Log messages in debug mode
     * @param {string} message - Message to log
     * @param {Object} data - Optional data to log
     */
    log(message, data = null) {
        if (this.debug) {
            if (data) {
                console.log(`[Scheduler] ${message}`, data);
            } else {
                console.log(`[Scheduler] ${message}`);
            }
        }
    }

    /**
     * Log errors
     * @param {string} message - Error message
     * @param {Error|Object} error - Error object
     */
    logError(message, error) {
        console.error(`[Scheduler Error] ${message}`, error);
    }

    /**
     * Initialize the scheduler
     * @returns {Promise<void>}
     */
    async init() {
        try {
            this.log('Initializing scheduler');
            await this.refreshMessages();
            
            // Set up periodic refresh (every 60 seconds)
            this.refreshInterval = setInterval(() => this.refreshMessages(), 60000);
            
            // Start checking for messages to send
            this.startMessageCheck();
            
            this.log('Scheduler initialized successfully');
        } catch (error) {
            this.logError('Failed to initialize scheduler', error);
            this.triggerEvent('saveError', { error });
            throw error;
        }
    }
    
    /**
     * Refresh messages from GitHub
     * @returns {Promise<Array>} Updated messages
     */
    async refreshMessages() {
        try {
            // Only fetch if authenticated
            if (!this.githubManager.isAuthenticated()) {
                this.log('Not authenticated, skipping refresh');
                return this.messages;
            }
            
            // Prevent too frequent refreshes
            const now = Date.now();
            if (now - this.lastFetchTime < 10000) {
                this.log('Skipping refresh - too soon since last refresh');
                return this.messages;
            }
            
            this.lastFetchTime = now;
            this.log('Refreshing messages from GitHub');
            
            const newMessages = await this.githubManager.fetchScheduledMessages();
            
            // Check if messages have changed
            if (JSON.stringify(this.messages) !== JSON.stringify(newMessages)) {
                this.log(`Messages updated: ${newMessages.length} messages retrieved`);
                this.messages = newMessages;
                this.triggerEvent('messagesUpdated', { messages: this.messages });
            } else {
                this.log('No changes to messages');
            }
            
            return this.messages;
        } catch (error) {
            this.logError('Failed to refresh messages', error);
            return this.messages;
        }
    }

    /**
     * Schedule a new message
     * @param {string} content - Message content
     * @param {string} scheduledTime - ISO datetime string
     * @returns {Promise<Object>} The scheduled message
     */
    async scheduleMessage(content, scheduledTime) {
        try {
            this.log(`Scheduling message for ${scheduledTime}`);
            
            const newMessage = {
                id: Date.now().toString(),
                content: content,
                scheduledTime: scheduledTime,
                created: new Date().toISOString()
            };

            this.messages.push(newMessage);
            await this.saveMessages();
            
            this.log('Message scheduled successfully', newMessage);
            this.triggerEvent('messageScheduled', { message: newMessage });
            
            return newMessage;
        } catch (error) {
            this.logError('Failed to schedule message', error);
            throw error;
        }
    }

    /**
     * Get all scheduled messages
     * @returns {Array} All messages
     */
    getAllMessages() {
        return [...this.messages];
    }

    /**
     * Delete a message by ID
     * @param {string} id - Message ID
     * @returns {Promise<boolean>} Success status
     */
    async deleteMessage(id) {
        try {
            this.log(`Deleting message with ID: ${id}`);
            
            const originalLength = this.messages.length;
            this.messages = this.messages.filter(msg => msg.id !== id);
            
            if (this.messages.length < originalLength) {
                await this.saveMessages();
                this.log('Message deleted successfully');
                this.triggerEvent('messageDeleted', { messageId: id });
                return true;
            } else {
                this.log('Message not found');
                return false;
            }
        } catch (error) {
            this.logError(`Failed to delete message with ID: ${id}`, error);
            throw error;
        }
    }

    /**
     * Start checking for messages to send
     */
    startMessageCheck() {
        if (this.isRunning) {
            this.log('Message check already running');
            return;
        }
        
        this.isRunning = true;
        this.log('Starting periodic message check');
        
        // Check immediately
        this.checkScheduledMessages();
        
        // Check every 30 seconds for messages to send
        setInterval(() => this.checkScheduledMessages(), 30000);
    }
    
    /**
     * Check for and send scheduled messages
     * @returns {Promise<void>}
     */
    async checkScheduledMessages() {
        if (!this.githubManager.isAuthenticated() || !this.webhook.getWebhookUrl()) {
            this.log('Not authenticated or no webhook URL, skipping message check');
            return;
        }
        
        try {
            const now = new Date();
            const messagesToSend = this.messages.filter(msg => 
                new Date(msg.scheduledTime) <= now
            );
            
            if (messagesToSend.length === 0) {
                return;
            }
            
            this.log(`Found ${messagesToSend.length} messages to send`);
            let saveRequired = false;
            
            for (const message of messagesToSend) {
                try {
                    this.log(`Sending message: ${message.id}`);
                    await this.webhook.sendMessage(message.content);
                    
                    // Remove the sent message from the list
                    this.messages = this.messages.filter(msg => msg.id !== message.id);
                    saveRequired = true;
                    
                    // Notify UI
                    this.triggerEvent('messageSent', { messageId: message.id });
                    this.log(`Message ${message.id} sent successfully`);
                    
                } catch (error) {
                    this.logError(`Error sending message ${message.id}`, error);
                    this.triggerEvent('messageError', { messageId: message.id, error });
                }
            }
            
            // Save the updated messages (with sent messages removed)
            if (saveRequired) {
                await this.saveMessages();
            }
        } catch (error) {
            this.logError('Error checking scheduled messages', error);
        }
    }

    /**
     * Save messages to GitHub with debouncing
     * @returns {Promise<boolean>} Success status
     */
    async saveMessages() {
        // If we already have a pending save, just mark that another save is needed
        if (this.pendingSave) {
            this.log('Another save already pending, will save soon');
            this.needsAnotherSave = true;
            return;
        }
        
        // Prevent too frequent saves
        const now = Date.now();
        const timeSinceLastSave = now - this.lastSaveTime;
        
        if (timeSinceLastSave < 2000) {
            // If it's too soon, schedule a save for later
            this.log(`Too soon to save (${timeSinceLastSave}ms), debouncing`);
            this.pendingSave = true;
            
            setTimeout(async () => {
                this.pendingSave = false;
                this.needsAnotherSave = false;
                await this.saveMessages();
                
                // If another save was requested while we were saving, do it again
                if (this.needsAnotherSave) {
                    setTimeout(() => this.saveMessages(), 100);
                }
            }, 2000 - timeSinceLastSave);
            
            return;
        }
        
        try {
            this.log(`Saving ${this.messages.length} messages to GitHub`);
            this.lastSaveTime = now;
            
            await this.githubManager.saveScheduledMessages(this.messages);
            
            this.log('Messages saved successfully');
            this.triggerEvent('messagesSaved', { count: this.messages.length });
            
            return true;
        } catch (error) {
            this.logError('Failed to save messages to GitHub', error);
            this.triggerEvent('saveError', { error });
            throw error;
        }
    }

    /**
     * Trigger a custom event
     * @param {string} eventName - Event name
     * @param {Object} data - Event data
     */
    triggerEvent(eventName, data) {
        const event = new CustomEvent(eventName, { detail: data });
        document.dispatchEvent(event);
        this.log(`Event triggered: ${eventName}`, data);
    }
    
    /**
     * Clean up resources
     */
    destroy() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
        this.isRunning = false;
        this.log('Scheduler destroyed');
    }
}
