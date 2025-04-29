class GitHubManager {
    constructor() {
        // Hardcoded credentials - replace with your own values
        this.token = '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';
        this.repo = 'Steinzu/discordScheduler';
    }

    isAuthenticated() {
        return true; // Always authenticated since we hardcoded the credentials
    }

    getCredentials() {
        return {
            token: this.token,
            repo: this.repo
        };
    }

    async fetchScheduledMessages() {
        try {
            // Try to get messages.json file from the repo
            const response = await fetch(`https://api.github.com/repos/${this.repo}/contents/data/messages.json`, {
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (response.status === 404) {
                // File doesn't exist yet, return empty array
                return [];
            }

            if (!response.ok) {
                throw new Error(`GitHub API error: ${response.statusText}`);
            }

            const data = await response.json();
            const content = atob(data.content);
            const messagesData = JSON.parse(content);
            
            return messagesData.messages || [];
        } catch (error) {
            console.error('Error fetching messages:', error);
            if (error.message.includes('404')) {
                return []; // Repository or file doesn't exist yet
            }
            throw error;
        }
    }

    async saveScheduledMessages(messages) {
        try {
            // Get the current file (if it exists) to get the SHA
            let sha = '';
            try {
                const fileResponse = await fetch(`https://api.github.com/repos/${this.repo}/contents/data/messages.json`, {
                    headers: {
                        'Authorization': `token ${this.token}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                });
                
                if (fileResponse.ok) {
                    const fileData = await fileResponse.json();
                    sha = fileData.sha;
                }
            } catch (e) {
                // File probably doesn't exist yet, which is fine
            }

            // Prepare the content to save
            const content = JSON.stringify({ messages: messages }, null, 2);
            const encodedContent = btoa(unescape(encodeURIComponent(content)));

            // Build the request body
            const body = {
                message: 'Update scheduled messages',
                content: encodedContent,
                branch: 'main'
            };

            if (sha) {
                body.sha = sha;
            }

            // Save the file
            const saveResponse = await fetch(`https://api.github.com/repos/${this.repo}/contents/data/messages.json`, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/vnd.github.v3+json'
                },
                body: JSON.stringify(body)
            });

            if (!saveResponse.ok) {
                const errorData = await saveResponse.json();
                throw new Error(`GitHub API error: ${errorData.message || saveResponse.statusText}`);
            }

            return true;
        } catch (error) {
            console.error('Error saving messages:', error);
            throw error;
        }
    }
}
