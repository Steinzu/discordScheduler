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

    // Initialize hour and minute selectors
    initTimeSelectors();

    // Set minimum date to today
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    scheduleDate.min = `${year}-${month}-${day}`;
    scheduleDate.value = `${year}-${month}-${day}`;

    // Set current hour and minute values (rounded to nearest 10 min)
    const currentHour = now.getHours();
    const currentMinute = Math.ceil(now.getMinutes() / 10) * 10;
    hourSelect.value = currentHour;
    minuteSelect.value = currentMinute >= 60 ? 0 : currentMinute;
    
    // If minutes rounded to next hour, increment hour
    if (currentMinute >= 60) {
        hourSelect.value = (currentHour + 1) % 24;
    }

    // Update hidden datetime field when any time component changes
    scheduleDate.addEventListener('change', updateDateTime);
    hourSelect.addEventListener('change', updateDateTime);
    minuteSelect.addEventListener('change', updateDateTime);
    
    // Initialize the scheduler
    await scheduler.init();
    renderMessages();

    // Event listeners
    scheduleBtn.addEventListener('click', async () => {
        const content = messageContent.value.trim();
        updateDateTime(); // Ensure the hidden field has the latest value
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
            await scheduler.scheduleMessage(content, new Date(timeValue).toISOString());
            messageContent.value = '';
            renderMessages();
            showStatus('Message scheduled successfully!');
        } catch (error) {
            showStatus(`Failed to schedule message: ${error.message}`, true);
        }
    });

    document.addEventListener('messageSent', (event) => {
        renderMessages();
        showStatus(`Message sent successfully at ${formatTime(new Date())}`);
    });

    document.addEventListener('messageError', (event) => {
        showStatus(`Failed to send message: ${event.detail.error.message}`, true);
    });

    document.addEventListener('saveError', (event) => {
        showStatus(`Failed to save message: ${event.detail.error.message}`, true);
    });

    // Initialize time selectors
    function initTimeSelectors() {
        // Add hours (0-23)
        for (let i = 0; i < 24; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = i.toString().padStart(2, '0');
            hourSelect.appendChild(option);
        }
        
        // Add minutes (00, 10, 20, 30, 40, 50)
        for (let i = 0; i < 60; i += 10) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = i.toString().padStart(2, '0');
            minuteSelect.appendChild(option);
        }
    }

    // Update the hidden datetime field with selected values
    function updateDateTime() {
        const dateValue = scheduleDate.value;
        const hourValue = hourSelect.value.padStart(2, '0');
        const minuteValue = minuteSelect.value.padStart(2, '0');
        
        if (dateValue) {
            scheduleTimeHidden.value = `${dateValue}T${hourValue}:${minuteValue}:00`;
        }
    }

    // Format date in 24-hour format
    function formatTime(date) {
        return date.toLocaleTimeString('en-GB', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false 
        });
    }

    // Format full date with 24-hour time
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
            
            messageEl.innerHTML = `
                <div class="message-content">${message.content}</div>
                <div class="message-schedule">
                    <span>Scheduled for: ${formatDateTime(scheduledDate)}</span>
                    ${message.sent ? '<span class="sent-badge">Sent</span>' : ''}
                </div>
                <div class="message-actions">
                    <button class="delete-btn" data-id="${message.id}">Delete</button>
                </div>
            `;
            
            messageList.appendChild(messageEl);
        });
        
        // Add event listeners to delete buttons
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                await scheduler.deleteMessage(id);
                renderMessages();
                showStatus('Message deleted');
            });
        });
    }

    function showStatus(message, isError = false) {
        statusIndicator.textContent = message;
        statusIndicator.className = isError ? 'status-error' : 'status-active';
        
        setTimeout(() => {
            statusIndicator.className = '';
        }, 3000);
    }
});
