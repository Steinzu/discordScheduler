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
     * @param {string} message
     * @param {Object} data
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
     * @param {string} message
     * @param {Error|Object} error
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
            
            this.refreshInterval = setInterval(() => this.refreshMessages(), 60000);
            
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
     * @returns {Promise<Array>}
     */
    async refreshMessages() {
        try {
            if (!this.githubManager.isAuthenticated()) {
                this.log('Not authenticated, skipping refresh');
                return this.messages;
            }
            
            const now = Date.now();
            if (now - this.lastFetchTime < 10000) {
                this.log('Skipping refresh - too soon since last refresh');
                return this.messages;
            }
            
            this.lastFetchTime = now;
            this.log('Refreshing messages from GitHub');
            
            const newMessages = await this.githubManager.fetchScheduledMessages();
            
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
     * @param {Object} messageData - Contains content and/or embed information
     * @param {string} scheduledTime
     * @returns {Promise<Object>}
     */
    async scheduleMessage(messageData, scheduledTime) {
        try {
            this.log(`Scheduling message for ${scheduledTime}`);
            
            const newMessage = {
                id: Date.now().toString(),
                messageData: messageData,
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
     * @returns {Array}
     */
    getAllMessages() {
        return [...this.messages];
    }

    /**
     * Delete a message by ID
     * @param {string} id
     * @returns {Promise<boolean>}
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
        
        this.checkScheduledMessages();
        
        setInterval(() => this.checkScheduledMessages(), 30000);
    }
    
    /**
     * Check for and send scheduled messages
     * @returns {Promise<void>}
     */
    async checkScheduledMessages() {
        if (!this.githubManager.isAuthenticated()) {
            this.log('Not authenticated, skipping message check');
            return;
        }
        
        try {
            await this.refreshMessages();
            
            const now = new Date();
            const messagesToSend = this.messages.filter(msg => 
                new Date(msg.scheduledTime) <= now
            );
            
            if (messagesToSend.length === 0) {
                return;
            }
            
            this.log(`Found ${messagesToSend.length} messages due for sending`);

            for (const message of messagesToSend) {
                this.log(`Message ${message.id} pending delivery via GitHub Actions`);
                this.triggerEvent('messagePending', { messageId: message.id });
            }

            this.triggerEvent('pendingMessagesUpdated', { messages: messagesToSend });
            
        } catch (error) {
            this.logError('Error checking scheduled messages', error);
        }
    }

    /**
     * Save messages to GitHub with debouncing
     * @returns {Promise<boolean>}
     */
    async saveMessages() {
        if (this.pendingSave) {
            this.log('Another save already pending, will save soon');
            this.needsAnotherSave = true;
            return;
        }

        const now = Date.now();
        const timeSinceLastSave = now - this.lastSaveTime;
        
        if (timeSinceLastSave < 2000) {
            this.log(`Too soon to save (${timeSinceLastSave}ms), debouncing`);
            this.pendingSave = true;
            
            setTimeout(async () => {
                this.pendingSave = false;
                this.needsAnotherSave = false;
                await this.saveMessages();
                
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
     * @param {string} eventName
     * @param {Object} data
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
