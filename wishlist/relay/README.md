# Your Wishlist relay

Browsers can't read other websites directly, so the Wishlist app needs a helper to fetch store pages. Out of the box it uses free public relays, which are shared, throttled and often blocked. This relay is your own: a small free Cloudflare Worker that only answers your Wishlist site.

**Cost:** free. Cloudflare's free plan allows 100,000 requests a day; a wishlist uses a handful.
**Time:** about 5 minutes, easiest on a computer.

## Set it up

1. **Create a free Cloudflare account** at https://dash.cloudflare.com/sign-up and verify your email.
2. In the dashboard sidebar, open **Workers & Pages** (it may be under **Compute**), then click **Create** → **Create Worker** (or **Start with Hello World**).
3. Name it `wishlist-relay` and click **Deploy**. Cloudflare creates a placeholder worker.
4. Click **Edit code**. Delete everything in the editor.
5. Open the relay code: https://raw.githubusercontent.com/dwigy/DFG/claude/8bit-dark-fantasy-game-2n7iib/wishlist/relay/worker.js. Select all, copy, and paste it into the editor.
6. Click **Deploy**.
7. Copy your worker's address. It looks like `https://wishlist-relay.YOUR-NAME.workers.dev`.
8. **Check it:** open that address in your browser. You should see `{"error":"This relay only serves the Wishlist app."}`. That means it's running and refusing everyone except your app.
9. **Connect it:** open the Wishlist app, tap **⋯** → **Connect your relay**, paste the address and tap **Test & save**. The menu then shows **Your relay: connected ✓**.

Do step 9 on each device you use, or send the address to Claude to build it into the app so every device uses it automatically.

## Using it from another address

The relay accepts requests only from `https://dwigy.github.io` and from local development (`localhost:3000`). If you host the app somewhere else, add that address: in the worker's **Settings → Variables and Secrets**, add a text variable `ALLOWED_ORIGINS` with the address (for example `https://wishlist.example.com`; separate several with commas), then deploy.

## What it does and doesn't do

- It fetches the page you added and passes it back to the app, with the address the page redirected to. It doesn't store anything.
- It refuses internal and local addresses, and requests from any other website.
- Stores with aggressive bot protection (Amazon, some big-box retailers) can still block it. When that happens, the app falls back to the public relays, then to "Try again" or "Add it myself".

## Command-line alternative

If you use Node and the Wrangler CLI:

```bash
cd wishlist/relay
npx wrangler login
npx wrangler deploy
```

Wrangler prints the `workers.dev` address when it finishes.
