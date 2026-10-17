# Your Wishlist relay

Browsers can't read other websites directly, so the Wishlist app needs a helper to fetch store pages. Out of the box it uses free public relays, which are shared, throttled and often blocked. This relay is your own: a small free Cloudflare Worker that only answers your Wishlist site.

**Cost:** free. Cloudflare's free plan allows 100,000 requests a day; a wishlist uses a handful.
**Time:** about 5 minutes, easiest on a computer.

## Set it up (one click)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/dwigy/DFG/tree/claude/8bit-dark-fantasy-game-2n7iib/wishlist/relay)

1. Click **Deploy to Cloudflare** above. If you don't have a Cloudflare account, sign up on that screen; it's free, and you can use Google or GitHub to sign in.
2. Cloudflare asks to connect GitHub so it can copy the relay code into a new repository of yours. Allow it, keep the name `wishlist-relay`, and click **Deploy**.
3. When it finishes, copy the worker's address. It looks like `https://wishlist-relay.YOUR-NAME.workers.dev`.
4. In the Wishlist app, tap **⋯** → **Connect your relay**, paste the address and tap **Test & save**. The menu then shows **Your relay: connected ✓**.

Do step 4 on each device you use, or send the address to Claude to build it into the app so every device uses it automatically.

## Set it up by hand (if the button doesn't work)

1. Create a free account at https://dash.cloudflare.com/sign-up.
2. Open **Workers & Pages** (it may be under **Compute**) → **Create** → **Create Worker**, name it `wishlist-relay`, click **Deploy**.
3. Click **Edit code**, delete everything, paste in the code from https://raw.githubusercontent.com/dwigy/DFG/claude/8bit-dark-fantasy-game-2n7iib/wishlist/relay/worker.js and click **Deploy**.
4. Opening the worker's address in a browser should show `{"error":"This relay only serves the Wishlist app."}`. That means it's running.
5. Connect it in the app as in step 4 above.

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
