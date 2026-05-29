# Stock Signal Dashboard

A full-stack stock tracking website for monitoring selected stocks, reading the
latest related news, and sending text notifications for price alerts.

## Features

- Track a custom watchlist of stock symbols.
- Refresh current prices and daily market movement.
- Select a stock to view quote details and recent news.
- Save watchlist, selected stock, phone number, and alert rules in the browser.
- Send test SMS notifications and check price threshold alerts.
- Uses Twilio for real SMS when credentials are configured; otherwise the server
  runs in dry-run mode and logs messages.

## Getting started

```bash
npm install
npm run dev
```

Open the Vite URL printed by the terminal, usually `http://localhost:5173`.

## SMS setup

To send real text messages, set these environment variables before starting the
server:

```bash
export TWILIO_ACCOUNT_SID="your-account-sid"
export TWILIO_AUTH_TOKEN="your-auth-token"
export TWILIO_FROM_NUMBER="+15551234567"
npm run dev
```

Without those variables, notification requests still work in dry-run mode and
the server logs the SMS payload.

## Scripts

- `npm run dev` - run the API and frontend together.
- `npm run build` - build the production frontend.
- `npm start` - run only the API server.
- `npm run check` - run the production build as a validation check.