import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const DEFAULT_SYMBOLS = ["AAPL", "MSFT", "NVDA"];

function formatMoney(value, currency = "USD") {
  if (value == null) return "N/A";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value) {
  if (value == null) return "N/A";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatDate(value) {
  if (!value) return "Recently";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

async function apiFetch(path, options) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
    ...options,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data;
}

function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : initialValue;
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue];
}

function App() {
  const [symbols, setSymbols] = useLocalStorage("tracked-symbols", DEFAULT_SYMBOLS);
  const [selectedSymbol, setSelectedSymbol] = useLocalStorage(
    "selected-symbol",
    DEFAULT_SYMBOLS[0]
  );
  const [quotes, setQuotes] = useState([]);
  const [news, setNews] = useState([]);
  const [newSymbol, setNewSymbol] = useState("");
  const [phoneNumber, setPhoneNumber] = useLocalStorage("sms-phone", "");
  const [alertPrice, setAlertPrice] = useState("");
  const [alertDirection, setAlertDirection] = useState("above");
  const [alertRules, setAlertRules] = useLocalStorage("sms-alert-rules", []);
  const [status, setStatus] = useState({ type: "idle", message: "" });
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [loadingNews, setLoadingNews] = useState(false);

  const selectedQuote = useMemo(
    () => quotes.find((quote) => quote.symbol === selectedSymbol),
    [quotes, selectedSymbol]
  );

  async function loadQuotes() {
    if (!symbols.length) {
      setQuotes([]);
      return;
    }

    setLoadingQuotes(true);
    try {
      const data = await apiFetch(`/api/stocks?symbols=${symbols.join(",")}`);
      setQuotes(data.quotes);
      setStatus({ type: "success", message: "Prices refreshed." });
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    } finally {
      setLoadingQuotes(false);
    }
  }

  async function loadNews(symbol) {
    if (!symbol) return;

    setLoadingNews(true);
    try {
      const data = await apiFetch(`/api/news?symbol=${symbol}`);
      setNews(data.news);
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    } finally {
      setLoadingNews(false);
    }
  }

  useEffect(() => {
    loadQuotes();
    const id = window.setInterval(loadQuotes, 60_000);
    return () => window.clearInterval(id);
  }, [symbols.join(",")]);

  useEffect(() => {
    loadNews(selectedSymbol);
  }, [selectedSymbol]);

  function addSymbol(event) {
    event.preventDefault();
    const symbol = newSymbol.trim().toUpperCase();
    if (!symbol || symbols.includes(symbol)) {
      setNewSymbol("");
      return;
    }

    setSymbols([...symbols, symbol]);
    setSelectedSymbol(symbol);
    setNewSymbol("");
  }

  function removeSymbol(symbol) {
    const nextSymbols = symbols.filter((item) => item !== symbol);
    setSymbols(nextSymbols);
    setAlertRules(alertRules.filter((rule) => rule.symbol !== symbol));
    if (selectedSymbol === symbol) {
      setSelectedSymbol(nextSymbols[0] || "");
      setNews([]);
    }
  }

  async function sendTestNotification() {
    try {
      const message = selectedQuote
        ? `${selectedQuote.symbol} is trading at ${formatMoney(
            selectedQuote.price,
            selectedQuote.currency
          )}.`
        : "Your stock tracker text notifications are working.";
      const result = await apiFetch("/api/notifications/test", {
        method: "POST",
        body: JSON.stringify({ phoneNumber, message }),
      });
      setStatus({
        type: "success",
        message:
          result.status === "dry-run"
            ? result.message
            : "Test text notification sent.",
      });
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    }
  }

  function addAlertRule(event) {
    event.preventDefault();
    if (!selectedSymbol || !alertPrice) return;

    setAlertRules([
      ...alertRules,
      {
        symbol: selectedSymbol,
        direction: alertDirection,
        targetPrice: Number(alertPrice),
      },
    ]);
    setAlertPrice("");
  }

  async function checkAlerts() {
    try {
      const data = await apiFetch("/api/notifications/check", {
        method: "POST",
        body: JSON.stringify({ phoneNumber, rules: alertRules }),
      });
      setStatus({
        type: "success",
        message: data.triggered.length
          ? `${data.triggered.length} alert text notification(s) triggered.`
          : "No alerts triggered on this check.",
      });
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    }
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Live stock watchlist</p>
          <h1>Track prices, scan the latest news, and get text alerts.</h1>
          <p>
            Add the stocks you care about, review current market movement, read
            recent news summaries, and configure SMS notifications for price
            thresholds.
          </p>
        </div>
        <form className="symbol-form" onSubmit={addSymbol}>
          <label htmlFor="symbol">Add stock symbol</label>
          <div>
            <input
              id="symbol"
              value={newSymbol}
              onChange={(event) => setNewSymbol(event.target.value)}
              placeholder="TSLA"
              maxLength={12}
            />
            <button type="submit">Track</button>
          </div>
        </form>
      </section>

      {status.message ? (
        <div className={`status ${status.type}`}>{status.message}</div>
      ) : null}

      <section className="grid">
        <div className="panel watchlist">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Selected stocks</p>
              <h2>Watchlist</h2>
            </div>
            <button className="secondary" onClick={loadQuotes} disabled={loadingQuotes}>
              {loadingQuotes ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          <div className="stock-list">
            {symbols.map((symbol) => {
              const quote = quotes.find((item) => item.symbol === symbol);
              const isUp = (quote?.change || 0) >= 0;

              return (
                <article
                  className={`stock-card ${
                    selectedSymbol === symbol ? "selected" : ""
                  }`}
                  key={symbol}
                >
                  <button onClick={() => setSelectedSymbol(symbol)}>
                    <span>
                      <strong>{symbol}</strong>
                      <small>{quote?.name || "Loading..."}</small>
                    </span>
                    <span className="price">
                      {formatMoney(quote?.price, quote?.currency)}
                      <small className={isUp ? "up" : "down"}>
                        {formatPercent(quote?.changePercent)}
                      </small>
                    </span>
                  </button>
                  <button
                    aria-label={`Remove ${symbol}`}
                    className="remove"
                    onClick={() => removeSymbol(symbol)}
                  >
                    Remove
                  </button>
                </article>
              );
            })}
          </div>
        </div>

        <div className="panel quote-panel">
          <p className="eyebrow">Current selection</p>
          <h2>{selectedQuote?.name || selectedSymbol || "No stock selected"}</h2>
          {selectedQuote ? (
            <div className="quote-details">
              <div>
                <span>Price</span>
                <strong>{formatMoney(selectedQuote.price, selectedQuote.currency)}</strong>
              </div>
              <div>
                <span>Daily change</span>
                <strong className={selectedQuote.change >= 0 ? "up" : "down"}>
                  {formatMoney(selectedQuote.change, selectedQuote.currency)} (
                  {formatPercent(selectedQuote.changePercent)})
                </strong>
              </div>
              <div>
                <span>Day range</span>
                <strong>
                  {formatMoney(selectedQuote.dayLow, selectedQuote.currency)} -{" "}
                  {formatMoney(selectedQuote.dayHigh, selectedQuote.currency)}
                </strong>
              </div>
              <div>
                <span>Market</span>
                <strong>{selectedQuote.marketState}</strong>
              </div>
              <div>
                <span>Last updated</span>
                <strong>{formatDate(selectedQuote.updatedAt)}</strong>
              </div>
            </div>
          ) : (
            <p>Add or select a symbol to see quote details.</p>
          )}
        </div>
      </section>

      <section className="grid lower-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Latest coverage</p>
              <h2>{selectedSymbol} news</h2>
            </div>
            <button
              className="secondary"
              onClick={() => loadNews(selectedSymbol)}
              disabled={loadingNews || !selectedSymbol}
            >
              {loadingNews ? "Loading..." : "Reload news"}
            </button>
          </div>

          <div className="news-list">
            {news.length ? (
              news.map((item) => (
                <a href={item.link} target="_blank" rel="noreferrer" key={item.id}>
                  <span>{item.publisher} • {formatDate(item.publishedAt)}</span>
                  <strong>{item.title}</strong>
                  <p>{item.summary}</p>
                </a>
              ))
            ) : (
              <p>No news loaded yet.</p>
            )}
          </div>
        </div>

        <div className="panel notifications">
          <p className="eyebrow">SMS notifications</p>
          <h2>Text alerts</h2>
          <label htmlFor="phone">Phone number</label>
          <input
            id="phone"
            value={phoneNumber}
            onChange={(event) => setPhoneNumber(event.target.value)}
            placeholder="+15551234567"
          />
          <button onClick={sendTestNotification} disabled={!phoneNumber}>
            Send test text
          </button>

          <form className="alert-form" onSubmit={addAlertRule}>
            <label htmlFor="alert-price">Alert when {selectedSymbol} is</label>
            <div className="inline-fields">
              <select
                value={alertDirection}
                onChange={(event) => setAlertDirection(event.target.value)}
              >
                <option value="above">above</option>
                <option value="below">below</option>
              </select>
              <input
                id="alert-price"
                type="number"
                step="0.01"
                min="0"
                value={alertPrice}
                onChange={(event) => setAlertPrice(event.target.value)}
                placeholder="250.00"
              />
            </div>
            <button type="submit" disabled={!selectedSymbol || !alertPrice}>
              Add alert rule
            </button>
          </form>

          <div className="rules">
            {alertRules.map((rule, index) => (
              <div className="rule" key={`${rule.symbol}-${rule.targetPrice}-${index}`}>
                <span>
                  {rule.symbol} {rule.direction} ${rule.targetPrice}
                </span>
                <button
                  className="remove"
                  onClick={() =>
                    setAlertRules(alertRules.filter((_, itemIndex) => itemIndex !== index))
                  }
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <button
            className="secondary"
            onClick={checkAlerts}
            disabled={!phoneNumber || !alertRules.length}
          >
            Check alerts now
          </button>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
