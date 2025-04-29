document.addEventListener('DOMContentLoaded', async () => {
    const webhook = new DiscordWebhook();
    const githubManager = new GitHubManager();
    const scheduler = new MessageScheduler(webhook, githubManager);
    
    const messageContent = document.getElementById('message-content');
    const scheduleTime = document.getElementById('schedule-time');
    const scheduleBtn = document.getElementById('schedule-message');
    const messageList = document.getElementById('message-list');
    const statusIndicator = document.getElementById('status-indicator');

    // Set minimum date-time to now for the scheduler
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    scheduleTime.min = `${year}-${month}-${day}T${hours}:${minutes}`;

    // Initialize the scheduler
    await scheduler.init();
    renderMessages();

    // Event listeners
    scheduleBtn.addEventListener('click', async () => {
        const content = messageContent.value.trim();
        const time = scheduleTime.value;
        
        if (!content) {
            showStatus('Please enter a message content', true);
            return;
        }
        
        if (!time) {
            showStatus('Please select a schedule time', true);
            return;
        }
        
        try {
            await scheduler.scheduleMessage(content, new Date(time).toISOString());
            messageContent.value = '';
            scheduleTime.value = '';
            renderMessages();
            showStatus('Message scheduled successfully!');
        } catch (error) {
            showStatus(`Failed to schedule message: ${error.message}`, true);
        }
    });

    document.addEventListener('messageSent', (event) => {
        renderMessages();
        showStatus(`Message sent successfully at ${new Date().toLocaleTimeString()}`);
    });

    document.addEventListener('messageError', (event) => {
        showStatus(`Failed to send message: ${event.detail.error.message}`, true);
    });

    document.addEventListener('saveError', (event) => {
        showStatus(`Failed to save message: ${event.detail.error.message}`, true);
    });

    async function renderMessages() {
        const messages = scheduler.getAllMessages();
        messageList.innerHTML = '';
        
        if (messages.length === 0) {
            messageList.innerHTML = '<p>No scheduled messages.</p>';
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
                    Scheduled for: ${scheduledDate.toLocaleString()}
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
