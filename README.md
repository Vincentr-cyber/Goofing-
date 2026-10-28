# XD Tech OTP Lock

A sleek, purple-themed web interface for WhatsApp OTP rate-limiting.

## Features

- 🔒 OTP lock spam with real-time status
- 📊 Live request counter and elapsed time
- ⏱️ Automatic lock detection
- 📜 Lock history
- 🎨 Purple/black tech aesthetic
- 🔐 Hidden API endpoints via environment variables
- 💚 Health check endpoint for Uptime Robot

## Deployment

### Render

1. Fork this repository
2. Create a new Web Service on Render
3. Connect your repository
4. Add environment variables from `.env.example`
5. Deploy!

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port | No (default: 3000) |
| `WA_REGISTRATION_HOST` | WhatsApp API host | Yes |
| `WA_USER_AGENT` | WhatsApp client UA | Yes |

### Health Check

Uptime Robot ping endpoint: `/health`

## Tech Stack

- Node.js + Express
- Vanilla JS frontend
- CSS custom properties for theming

## License

MIT
