document.addEventListener('DOMContentLoaded', async () => {
    const webhook = new DiscordWebhook();
    const githubManager = new GitHubManager();
    const scheduler = new MessageScheduler(webhook, githubManager);
    
    const messageContent = document.getElementById('message-content');
    const scheduleTimeHidden = document.getElementById('schedule-time');
    const scheduleDate = document.getElementById('schedule-date');
    const hourSelect = document.getElementById('hour-select');
    const minuteSelect = document.getElementById('minute-select');
    const scheduleBtn = document.getElementById('schedule-message');
    const messageList = document.getElementById('message-list');
    const statusIndicator = document.getElementById('status-indicator');
    const tokenModal = document.getElementById('token-modal');
    const githubToken = document.getElementById('github-token');
    const submitToken = document.getElementById('submit-token');
    const loginStatus = document.getElementById('login-status');
    const scheduleHeader = document.querySelector('.message-composer h2');

    const debug = true;
    function log(message, data = null) {
        if (debug) {
            if (data) {
                console.log(`[App] ${message}`, data);
            } else {
                console.log(`[App] ${message}`);
            }
        }
    }

    initTimeSelectors();
    
    updateAuthStatus();

    if (!githubManager.isAuthenticated()) {
        log('No GitHub token found, showing token modal');
        tokenModal.classList.add('active');
    } else {
        log('GitHub token found, initializing app');
        initializeApp();
    }

    submitToken.addEventListener('click', async () => {
        const token = githubToken.value.trim();
        if (!token) {
            showStatus('Please enter a valid token', true);
            return;
        }

        showStatus('Validating token...', false);
        
        try {
            const valid = await githubManager.setToken(token);
            
            if (valid) {
                log('Token validation successful');
                tokenModal.classList.remove('active');
                updateAuthStatus();
                initializeApp();
                showStatus('GitHub authentication successful!');
            } else {
                log('Token validation failed');
                showStatus('Invalid token or insufficient permissions', true);
            }
        } catch (error) {
            log('Token validation error', error);
            showStatus(`Authentication error: ${error.message}`, true);
        }
    });

    scheduleBtn.addEventListener('click', async () => {
        if (!githubManager.isAuthenticated()) {
            showStatus('GitHub token required', true);
            tokenModal.classList.add('active');
            return;
        }

        const content = messageContent.value.trim();
        updateDateTime();
        const timeValue = scheduleTimeHidden.value;
        
        if (!content) {
            showStatus('Please enter a message content', true);
            return;
        }
        
        if (!timeValue) {
            showStatus('Please select a schedule time', true);
            return;
        }
        
        try {
            scheduleBtn.disabled = true;
            scheduleBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Scheduling...';
            
            await scheduler.scheduleMessage(content, new Date(timeValue).toISOString());
            
            messageContent.value = '';
            renderMessages();
            showStatus('Message scheduled successfully!');
        } catch (error) {
            log('Error scheduling message', error);
            
            if (!githubManager.isAuthenticated()) {
                showStatus('GitHub token required or invalid', true);
                tokenModal.classList.add('active');
            } else {
                showStatus(`Failed to schedule message: ${error.message}`, true);
            }
        } finally {
            scheduleBtn.disabled = false;
            scheduleBtn.innerHTML = '<i class="far fa-paper-plane"></i> Schedule Message';
        }
    });

    document.addEventListener('messageSent', (event) => {
        log('Message sent event received', event.detail);
        renderMessages();
        showStatus(`Message sent successfully at ${formatTime(new Date())}`);
    });

    document.addEventListener('messageError', (event) => {
        log('Message error event received', event.detail);
        showStatus(`Failed to send message: ${event.detail.error.message}`, true);
    });

    document.addEventListener('saveError', (event) => {
        log('Save error event received', event.detail);
        showStatus(`Failed to save message: ${event.detail.error.message}`, true);
    });

    document.addEventListener('messagesUpdated', (event) => {
        log('Messages updated event received', { count: event.detail.messages.length });
        renderMessages();
    });
    
    document.addEventListener('messageScheduled', (event) => {
        log('Message scheduled event received', event.detail);
        renderMessages();
    });
    
    document.addEventListener('messageDeleted', (event) => {
        log('Message deleted event received', event.detail);
        renderMessages();
    });

    /**
     * Initialize the application
     */
    async function initializeApp() {
        log('Initializing application');
        
        updateAuthStatus();
        
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        scheduleDate.min = `${year}-${month}-${day}`;
        scheduleDate.value = `${year}-${month}-${day}`;

        const currentHour = now.getHours();
        const currentMinute = Math.ceil(now.getMinutes() / 10) * 10;
        hourSelect.value = currentHour;
        minuteSelect.value = currentMinute >= 60 ? 0 : currentMinute;
        
        if (currentMinute >= 60) {
            hourSelect.value = (currentHour + 1) % 24;
        }

        updateDateTime();

        scheduleDate.addEventListener('change', updateDateTime);
        hourSelect.addEventListener('change', updateDateTime);
        minuteSelect.addEventListener('change', updateDateTime);
        
        try {
            showStatus('Connecting to GitHub...');
            await scheduler.init();
            renderMessages();
            showStatus('Ready to schedule messages!');
        } catch (error) {
            log('Failed to initialize scheduler', error);
            showStatus('Failed to initialize: Token may be invalid', true);
            tokenModal.classList.add('active');
        }
    }

    /**
     * Update authentication status display
     */
    function updateAuthStatus() {
        if (githubManager.isAuthenticated()) {
            const credentials = githubManager.getCredentials();
            const username = credentials.user || 'authenticated';
            
            updateLoginStatus(true);
            
            if (loginStatus) {
                loginStatus.innerHTML += `
                    Logged in</strong>
                    <button id="logout-btn" class="text-btn">
                        <i class="fas fa-sign-out-alt"></i> Logout
                    </button>
                `;
                
                document.getElementById('logout-btn').addEventListener('click', () => {
                    githubManager.clearData();
                    updateAuthStatus();
                    tokenModal.classList.add('active');
                    showStatus('Logged out successfully');
                });
            }
            
            if (scheduleHeader) {
                scheduleHeader.innerHTML = '<i class="far fa-calendar-plus"></i> Create Schedule';
            }
            
            if (scheduleBtn) {
                scheduleBtn.disabled = false;
            }
        } else {
            updateLoginStatus(false);
            
            if (loginStatus) {
                loginStatus.innerHTML += `
                    <button id="login-btn" class="text-btn">
                        <i class="fas fa-sign-in-alt"></i> Login
                    </button>
                `;
                
                document.getElementById('login-btn').addEventListener('click', () => {
                    tokenModal.classList.add('active');
                });
            }
            
            if (scheduleHeader) {
                scheduleHeader.innerHTML = '<i class="fas fa-lock"></i> Authentication Required';
            }
            
            if (scheduleBtn) {
                scheduleBtn.disabled = true;
            }
        }
    }

    /**
     * Update login status display
     * @param {boolean} isLoggedIn
     */
    function updateLoginStatus(isLoggedIn) {
        const loginStatus = document.getElementById('login-status');
        
        if (isLoggedIn) {
            // Show just the success icon
            loginStatus.className = 'auth-status logged-in';
            loginStatus.innerHTML = '<i class="fas fa-check-circle"></i>';
        } else {
            // Not logged in
            loginStatus.className = 'auth-status logged-out';
            loginStatus.innerHTML = '<i class="fas fa-times-circle"></i> Not logged in';
        }
    }

    /**
     * Initialize time selectors
     */
    function initTimeSelectors() {
        log('Initializing time selectors');
        
        hourSelect.innerHTML = '';
        minuteSelect.innerHTML = '';
        
        for (let i = 0; i < 24; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = i.toString().padStart(2, '0');
            hourSelect.appendChild(option);
        }
        
        for (let i = 0; i < 60; i += 10) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = i.toString().padStart(2, '0');
            minuteSelect.appendChild(option);
        }
    }

    /**
     * Update the hidden datetime field with selected values
     */
    function updateDateTime() {
        const dateValue = scheduleDate.value;
        const hourValue = hourSelect.value.toString().padStart(2, '0');
        const minuteValue = minuteSelect.value.toString().padStart(2, '0');
        
        if (dateValue) {
            scheduleTimeHidden.value = `${dateValue}T${hourValue}:${minuteValue}:00`;
            log('Updated datetime value', scheduleTimeHidden.value);
        }
    }

    /**
     * Format date in 24-hour format
     * @param {Date} date
     * @returns {string}
     */
    function formatTime(date) {
        return date.toLocaleTimeString('en-GB', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false 
        });
    }

    /**
     * Format full date with 24-hour time
     * @param {Date} date
     * @returns {string}
     */
    function formatDateTime(date) {
        return date.toLocaleDateString('en-GB', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
    }

    /**
     * Render the message list
     */
    async function renderMessages() {
        const messages = scheduler.getAllMessages();
        messageList.innerHTML = '';
        
        if (messages.length === 0) {
            messageList.innerHTML = '<p>No scheduled messages yet.</p>';
            return;
        }
        
        messages.sort((a, b) => new Date(a.scheduledTime) - new Date(b.scheduledTime));

        messages.forEach(message => {
            const messageEl = document.createElement('div');
            messageEl.className = 'message-item';
            
            const scheduledDate = new Date(message.scheduledTime);
            const isPastDue = scheduledDate <= new Date();
            
            messageEl.innerHTML = `
                <div class="message-content">${escape(message.content)}</div>
                <div class="message-schedule">
                    <span>Scheduled for: ${formatDateTime(scheduledDate)}</span>
                    ${isPastDue ? '<span class="pending-badge">Sending soon</span>' : ''}
                </div>
                <div class="message-actions">
                    <button class="delete-btn" data-id="${message.id}">Delete</button>
                </div>
            `;
            
            messageList.appendChild(messageEl);
        });

        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                try {
                    const id = btn.getAttribute('data-id');
                    btn.disabled = true;
                    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                    
                    await scheduler.deleteMessage(id);
                    renderMessages();
                    showStatus('Message deleted');
                } catch (error) {
                    log('Error deleting message', error);
                    showStatus(`Failed to delete message: ${error.message}`, true);
                }
            });
        });
    }

    /**
     * Show a status message
     * @param {string} message
     * @param {boolean} isError
     */
    function showStatus(message, isError = false) {
        log(`Status update: ${message}`, { isError });
        
        statusIndicator.textContent = message;
        statusIndicator.className = isError ? 'status-error' : 'status-active';
        
        setTimeout(() => {
            statusIndicator.className = '';
        }, 3000);
    }
    
    /**
     * Escape HTML to prevent XSS
     * @param {string} text
     * @returns {string}
     */
    function escape(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
});
