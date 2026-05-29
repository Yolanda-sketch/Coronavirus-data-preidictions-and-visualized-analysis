import cors from "cors";
import express from "express";
import twilio from "twilio";
import { z } from "zod";

const PORT = process.env.PORT || 3001;
const YAHOO_HOST = "query1.finance.yahoo.com";

const app = express();
app.use(cors());
app.use(express.json());

const alertState = new Map();

const stockSymbolsSchema = z.object({
  symbols: z
    .array(z.string().trim().min(1).max(12))
    .min(1)
    .max(25)
    .transform((symbols) =>
      [...new Set(symbols.map((symbol) => symbol.toUpperCase()))]
    ),
});

const notificationSchema = z.object({
  phoneNumber: z.string().trim().min(7),
  message: z.string().trim().min(1).max(800),
});

const alertSchema = z.object({
  phoneNumber: z.string().trim().min(7),
  rules: z
    .array(
      z.object({
        symbol: z.string().trim().min(1).max(12).transform((value) => value.toUpperCase()),
        targetPrice: z.coerce.number().positive(),
        direction: z.enum(["above", "below"]),
      })
    )
    .max(25),
});

function normalizeQuote(rawQuote) {
  return {
    symbol: rawQuote.symbol,
    name: rawQuote.shortName || rawQuote.longName || rawQuote.symbol,
    price: rawQuote.regularMarketPrice ?? null,
    change: rawQuote.regularMarketChange ?? null,
    changePercent: rawQuote.regularMarketChangePercent ?? null,
    currency: rawQuote.currency || "USD",
    marketState: rawQuote.marketState || "unknown",
    previousClose: rawQuote.regularMarketPreviousClose ?? null,
    dayHigh: rawQuote.regularMarketDayHigh ?? null,
    dayLow: rawQuote.regularMarketDayLow ?? null,
    updatedAt:
      rawQuote.regularMarketTime != null
        ? new Date(rawQuote.regularMarketTime * 1000).toISOString()
        : new Date().toISOString(),
  };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "stock-signal-dashboard/1.0",
      Accept: "application/json,text/plain,*/*",
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }

  return response.json();
}

async function getQuotes(symbols) {
  const params = new URLSearchParams({
    formatted: "false",
    symbols: symbols.join(","),
    fields:
      "symbol,shortName,longName,regularMarketPrice,regularMarketChange,regularMarketChangePercent,currency,marketState,regularMarketPreviousClose,regularMarketDayHigh,regularMarketDayLow,regularMarketTime",
  });
  const data = await fetchJson(
    `https://${YAHOO_HOST}/v7/finance/quote?${params.toString()}`
  );

  return (data.quoteResponse?.result || []).map(normalizeQuote);
}

async function getNews(symbol) {
  const params = new URLSearchParams({
    q: symbol,
    lang: "en-US",
    region: "US",
    newsCount: "8",
  });
  const data = await fetchJson(
    `https://${YAHOO_HOST}/v1/finance/search?${params.toString()}`
  );

  return (data.news || []).slice(0, 8).map((item) => ({
    id: String(item.uuid || item.link),
    title: item.title,
    publisher: item.publisher,
    link: item.link,
    summary: item.summary || summarizeTitle(item.title),
    publishedAt:
      item.providerPublishTime != null
        ? new Date(item.providerPublishTime * 1000).toISOString()
        : null,
  }));
}

function summarizeTitle(title = "") {
  if (!title) {
    return "No summary was provided by the source.";
  }

  return title.length > 150 ? `${title.slice(0, 147)}...` : title;
}

function getTwilioClient() {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER } =
    process.env;

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
    return null;
  }

  return {
    client: twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN),
    from: TWILIO_FROM_NUMBER,
  };
}

async function sendSms(to, body) {
  const twilioConfig = getTwilioClient();

  if (!twilioConfig) {
    console.info(`[sms dry-run] To: ${to}; Message: ${body}`);
    return {
      status: "dry-run",
      message:
        "SMS credentials are not configured. The message was logged by the server instead.",
    };
  }

  const result = await twilioConfig.client.messages.create({
    from: twilioConfig.from,
    to,
    body,
  });

  return {
    status: "sent",
    sid: result.sid,
  };
}

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.get("/api/stocks", async (request, response) => {
  const symbols = String(request.query.symbols || "")
    .split(",")
    .map((symbol) => symbol.trim())
    .filter(Boolean);

  const parsed = stockSymbolsSchema.safeParse({ symbols });
  if (!parsed.success) {
    return response.status(400).json({ error: "Provide 1-25 stock symbols." });
  }

  try {
    const quotes = await getQuotes(parsed.data.symbols);
    response.json({ quotes });
  } catch (error) {
    response.status(502).json({
      error: "Unable to load stock prices right now.",
      details: error.message,
    });
  }
});

app.get("/api/news", async (request, response) => {
  const symbol = String(request.query.symbol || "").trim().toUpperCase();
  if (!symbol) {
    return response.status(400).json({ error: "A stock symbol is required." });
  }

  try {
    const news = await getNews(symbol);
    response.json({ symbol, news });
  } catch (error) {
    response.status(502).json({
      error: "Unable to load stock news right now.",
      details: error.message,
    });
  }
});

app.post("/api/notifications/test", async (request, response) => {
  const parsed = notificationSchema.safeParse(request.body);
  if (!parsed.success) {
    return response.status(400).json({ error: "Phone number and message are required." });
  }

  try {
    const result = await sendSms(parsed.data.phoneNumber, parsed.data.message);
    response.json(result);
  } catch (error) {
    response.status(502).json({
      error: "Unable to send the text notification.",
      details: error.message,
    });
  }
});

app.post("/api/notifications/check", async (request, response) => {
  const parsed = alertSchema.safeParse(request.body);
  if (!parsed.success) {
    return response.status(400).json({ error: "Phone number and alert rules are required." });
  }

  try {
    const symbols = [...new Set(parsed.data.rules.map((rule) => rule.symbol))];
    const quotes = await getQuotes(symbols);
    const quotesBySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]));
    const triggered = [];

    for (const rule of parsed.data.rules) {
      const quote = quotesBySymbol.get(rule.symbol);
      if (!quote || quote.price == null) {
        continue;
      }

      const isTriggered =
        rule.direction === "above"
          ? quote.price >= rule.targetPrice
          : quote.price <= rule.targetPrice;
      const key = `${parsed.data.phoneNumber}:${rule.symbol}:${rule.direction}:${rule.targetPrice}`;

      if (isTriggered && !alertState.get(key)) {
        const body = `${rule.symbol} is ${rule.direction} ${rule.targetPrice}: current price is ${quote.price} ${quote.currency}.`;
        const sms = await sendSms(parsed.data.phoneNumber, body);
        alertState.set(key, true);
        triggered.push({ rule, quote, sms });
      } else if (!isTriggered) {
        alertState.set(key, false);
      }
    }

    response.json({ checkedAt: new Date().toISOString(), triggered });
  } catch (error) {
    response.status(502).json({
      error: "Unable to check text alerts.",
      details: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Stock tracker API listening on http://localhost:${PORT}`);
});
