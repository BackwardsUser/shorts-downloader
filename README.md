# shorts-downloader

A Discord bot that automatically detects and downloads videos from Instagram Reels, TikTok, YouTube Shorts, and other platforms, then posts them directly in your Discord channels. No more broken embeds or image-only previews.

## Features

- Automatically detects video URLs in messages
- Downloads and reposts videos directly to Discord
- Pre-configured for Instagram Reels and YouTube Shorts (requires yt-dlp binary)
- Extensible architecture for adding more platforms
- Docker support for easy deployment

## Prerequisites

- Node.js (v16 or higher recommended)
- npm or yarn
- A Discord bot token ([create one here](https://discord.com/developers/applications))
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) binary

## Installation

### 1. Clone the repository
```bash
git clone https://github.com/yourusername/shorts-downloader.git
cd shorts-downloader
```

### 2. Install dependencies
```bash
npm install
```

### 3. Download yt-dlp binary
Download the [yt-dlp](https://github.com/yt-dlp/yt-dlp) binary and place it in the `bin` directory at the project root (next to the `src` folder).

**Linux/macOS:**
```bash
mkdir -p bin
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o bin/yt-dlp
chmod +x bin/yt-dlp
```

**Windows:**
Download `yt-dlp.exe` from the [releases page](https://github.com/yt-dlp/yt-dlp/releases) and place it in the `bin` folder.

### 4. Configure the bot
Create a configuration file named `conversions.json` in the `data` directory. This file defines which platforms to monitor and how to download videos from them.

Example `data/conversions.json`:
```json
{
  "youtube": {
    "strings": [
      "https://youtube.com/shorts/*",
      "https://www.youtube.com/shorts/*"
    ],
    "cmd": {
      "bin": "yt-dlp",
      "args": [
        "--js-runtimes",
        "node",
        "-f",
        "mp4",
        "-S",
        "+size,+br",
        "-o",
        "tmp/%(id)s.%(ext)s",
        "(url)"
      ]
    }
  },
  "instagram": {
    "strings": [
      "https://www.instagram.com/reel/*"
    ],
    "cmd": {
      "bin": "yt-dlp",
      "args": [
        "--js-runtimes",
        "node",
        "-f",
        "mp4",
        "-S",
        "+size,+br",
        "-o",
        "tmp/(id).%(ext)s",
        "(url)"
      ]
    }
  }
}
```

**Configuration breakdown:**
- `strings`: Array of URL RegEx patterns to match. 
- `cmd.bin`: Name of the binary in the `bin` directory to execute
- `cmd.args`: Arguments passed to the binary. `(url)` is replaced with the detected URL at runtime
- `(id)` is swapped with a uuid placeholder name for the generated file.
- The output path uses `tmp/(id).%(ext)s` format for yt-dlp's template system

### 5. Set up your Discord token
Create a `.env` file in the project root:
```env
TOKEN=your_bot_token_here
```

### 6. Run the bot
```bash
npm run dev
```

## Docker Deployment

The included Docker setup is configured for Linux environments.

### Setup

1. Create the required directories: `mkdir -p /srv/shorts-downloader/{bin,data,tmp}`
2. Place the yt-dlp binary in `/srv/shorts-downloader/bin/`
3. Create your `conversions.json` file in `/srv/shorts-downloader/data/`
4. Update the `docker-compose.yml` with your Discord token (not documented here)

### Run
```bash
docker-compose up -d
```

The `data` and `bin` directories are mounted from `/srv/shorts-downloader/` on the host system.

## Adding Support for More Platforms

The bot uses a modular architecture. To add support for TikTok or other platforms:

1. Check if [yt-dlp supports the platform](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md)
2. Add a new entry to `data/conversions.json` following the existing pattern:

```json
{
  "tiktok": {
    "strings": [
      "https://www.tiktok.com/*",
      "https://vm.tiktok.com/*"
    ],
    "cmd": {
      "bin": "yt-dlp",
      "args": [
        "--js-runtimes",
        "node",
        "-f",
        "mp4",
        "-S",
        "+size,+br",
        "-o",
        "tmp/%(id)s.%(ext)s",
        "(url)"
      ]
    }
  }
}
```

3. If the platform isn't supported by yt-dlp, download the appropriate binary to the `bin` directory, add it to your configuration, and adjust the `args` array as needed for that binary's command-line interface

## How It Works

1. The bot monitors all messages in channels where it has access
2. When a message contains a URL matching a configured pattern, the bot triggers
3. The appropriate binary downloads the video
4. The bot uploads the video directly to Discord
5. The original message is deleted
5. Users can watch the video without leaving Discord

## Troubleshooting

**Bot not responding:**
- Verify your Discord token is correct
- Ensure the bot has proper permissions in your server (Read Messages, Send Messages, Attach Files)
- The bot logs pretty thourougly, check the logs and see if it gives any insights.

**Download failures:**
- Check that yt-dlp binary has execute permissions (`chmod +x bin/yt-dlp`)
- Some platforms may have rate limiting or require authentication
- Ensure the URL format matches your configuration patterns

**File too large:**
- Discord has file size limits (8MB for non-Nitro servers, 100MB for Nitro)
- The bot checks file size before submitting, it shouldn't crash for file size, if it does, create an issue.
- If you feel you're getting this error too frequently, open an issue requesting this to be fixed, or feel free to make a pull request :)

## Contributing

Contributions are welcome! Here's how you can help:

- Report bugs by opening an issue
- Suggest new features or improvements
- Submit pull requests with bug fixes or new platform support
- Improve documentation

Please ensure your code follows the existing style.

Trivial PRs will be denied.

## Acknowledgments

- [yt-dlp](https://github.com/yt-dlp/yt-dlp) for the excellent video downloading capabilities
- [Discord.js](https://discord.js.org/) community for bot development resources
- [Claude](https://claude.ai/) README editing

Note: if there are any errors with this readme, it's claudes fault.  
Claude never saw the code and only edited my rough draft of this document.