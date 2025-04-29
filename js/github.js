class GitHubManager {
    constructor() {
        this.token = sessionStorage.getItem('ghub_token') || '';
        this.repo = 'Steinzu/discordScheduler';
        this.cacheBuster = Date.now(); // Prevent caching issues
    }

    isAuthenticated() {
        return !!this.token;
    }

    setToken(token) {
        this.token = token;
        sessionStorage.setItem('ghub_token', token);
    }

    getCredentials() {
        return {
            token: this.token,
            repo: this.repo
        };
    }

    async fetchScheduledMessages() {
        if (!this.isAuthenticated()) {
            throw new Error('Authentication required');
        }

        try {
            // Add cache buster to prevent stale data
            const url = `https://api.github.com/repos/${this.repo}/contents/data/messages.json?timestamp=${this.cacheBuster}`;
            const response = await fetch(url, {
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Cache-Control': 'no-cache, no-store, must-revalidate'
                }
            });

            if (response.status === 404) {
                return [];
            }

            if (!response.ok) {
                throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            const content = atob(data.content);
            const messagesData = JSON.parse(content);
            this.lastSha = data.sha; // Store SHA for later use
            
            return messagesData.messages || [];
        } catch (error) {
            console.error('Error fetching messages:', error);
            if (error.message.includes('404')) {
                return [];
            }
            throw error;
        } finally {
            // Update cache buster for next request
            this.cacheBuster = Date.now();
        }
    }

    async saveScheduledMessages(messages) {
        if (!this.isAuthenticated()) {
            throw new Error('Authentication required');
        }

        try {
            // Check if gh-pages branch exists, create it if it doesn't
            try {
                await this.ensureBranchExists('gh-pages');
            } catch (branchError) {
                console.error('Error ensuring branch exists:', branchError);
                throw new Error('Could not access or create gh-pages branch');
            }

            // If we don't have the SHA from a previous fetch, get it now
            if (!this.lastSha) {
                try {
                    const fileResponse = await fetch(`https://api.github.com/repos/${this.repo}/contents/data/messages.json?ref=gh-pages`, {
                        headers: {
                            'Authorization': `token ${this.token}`,
                            'Accept': 'application/vnd.github.v3+json',
                            'Cache-Control': 'no-cache'
                        }
                    });
                    
                    if (fileResponse.ok) {
                        const fileData = await fileResponse.json();
                        this.lastSha = fileData.sha;
                    }
                } catch (e) {
                    // File probably doesn't exist yet - that's okay
                    console.log('File does not exist yet, will create it');
                }
            }

            // Prepare the content to save
            const content = JSON.stringify({ messages: messages }, null, 2);
            const encodedContent = btoa(unescape(encodeURIComponent(content)));

            // Build the request body
            const body = {
                message: 'Update scheduled messages',
                content: encodedContent,
                branch: 'gh-pages',
                sha: this.lastSha || undefined
            };

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
                console.error('GitHub API error details:', errorData);
                throw new Error(`GitHub API error: ${errorData.message || saveResponse.statusText}`);
            }

            // Update SHA for next save
            const responseData = await saveResponse.json();
            this.lastSha = responseData.content.sha;

            return true;
        } catch (error) {
            console.error('Error saving messages:', error);
            throw error;
        }
    }

    async ensureBranchExists(branchName) {
        // First check if the branch exists
        try {
            const response = await fetch(`https://api.github.com/repos/${this.repo}/branches/${branchName}`, {
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            
            if (response.status === 404) {
                // Branch doesn't exist, create it based on main/master
                // First, get the SHA of the default branch
                const repoResponse = await fetch(`https://api.github.com/repos/${this.repo}`, {
                    headers: {
                        'Authorization': `token ${this.token}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                });
                
                if (!repoResponse.ok) {
                    throw new Error('Could not get repository information');
                }
                
                const repoData = await repoResponse.json();
                const defaultBranch = repoData.default_branch;
                
                // Get the SHA of the latest commit on the default branch
                const refResponse = await fetch(`https://api.github.com/repos/${this.repo}/git/refs/heads/${defaultBranch}`, {
                    headers: {
                        'Authorization': `token ${this.token}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                });
                
                if (!refResponse.ok) {
                    throw new Error('Could not get reference for default branch');
                }
                
                const refData = await refResponse.json();
                const sha = refData.object.sha;
                
                // Create the new branch
                const createResponse = await fetch(`https://api.github.com/repos/${this.repo}/git/refs`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `token ${this.token}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/vnd.github.v3+json'
                    },
                    body: JSON.stringify({
                        ref: `refs/heads/${branchName}`,
                        sha: sha
                    })
                });
                
                if (!createResponse.ok) {
                    const createErrorData = await createResponse.json();
                    throw new Error(`Failed to create branch: ${createErrorData.message}`);
                }
                
                console.log(`Created ${branchName} branch successfully`);
            }
            
            return true;
        } catch (error) {
            console.error(`Error ensuring branch exists: ${error.message}`);
            throw error;
        }
    }
}
