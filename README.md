# Discord Webhook Scheduler

A simple web application that allows users to schedule messages to be sent to a Discord channel via a webhook. This application uses GitHub Actions as a serverless backend to send messages at scheduled times.

## Features

- Schedule messages to be sent at specific times
- Messages will be sent even when your browser is closed
- No user authentication required
- Manage scheduled messages (view and delete)
- Uses GitHub Actions as a serverless runner

## How It Works

1. Users enter a message and select a time
2. The message is stored in a GitHub repository
3. A GitHub Action runs on a schedule to check for and send messages
4. The scheduled messages are sent directly to Discord from GitHub's servers

## Deployment Instructions (For Repository Owner)

1. Before deploying, replace these values in the source code:
   - In `js/github.js`: Replace `YOUR_GITHUB_PERSONAL_ACCESS_TOKEN` with your actual token
   - In `js/github.js`: Replace `YOUR_USERNAME/YOUR_REPOSITORY` with your GitHub username and repository name
   - In `js/webhook.js`: Replace `YOUR_DISCORD_WEBHOOK_URL` with the Discord webhook URL

2. Push the code to your GitHub repository

3. Set up the GitHub Action:
   - Make sure the `.github/workflows/send-messages.yml` file is in your repository
   - Add the Discord webhook URL as a repository secret named `DISCORD_WEBHOOK_URL`

4. Enable GitHub Pages in repository settings:
   - Go to Settings > Pages
   - Set source to the main branch

5. Your scheduler will be available at `https://[your-username].github.io/[repo-name]/`

## GitHub Token Requirements

The Personal Access Token needs the `repo` scope to be able to read and write to the repository. Create one at [GitHub Personal Access Tokens](https://github.com/settings/tokens).

## Privacy & Security

- All messages are stored in your GitHub repository
- No user credentials are required for end users
- All API requests are made using your GitHub token
