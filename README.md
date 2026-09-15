# Instagram Comment-to-DM Automation Engine 🚀

A highly scalable, production-ready Node.js backend that listens to live Instagram comments via Meta Webhooks and instantly sends automated Private DMs containing product links, followed by a randomized public comment reply.

## 🏗️ System Architecture

This system is built on an **Event-Driven Webhook Architecture**, ensuring absolute zero-polling delay and infinite scalability.

1. **Meta Webhook (Instant Trigger):** When a user comments, Meta pushes a live event to the `/webhook/instagram` endpoint in milliseconds.
2. **In-Memory Guard:** The server instantly checks a blazing-fast RAM cache to verify if the user has already received a DM for this specific post.
3. **Instagram Graph API:** If approved, the server securely dispatches a Private Reply (DM) to the user's `comment_id`.
4. **Anti-Spam Public Reply:** A randomized public reply is posted to the user's comment (e.g., *"Check your DM!"*).
5. **Persistent Storage:** The user's ID and Post ID are appended to a Google Sheet (`DM_Sent` tab) in the background to permanently lock them out of duplicate messages across server restarts.

---

## 🛡️ Strict Deduplication Logic ("One Link Per Post")

To guarantee that a user **never** gets spammed with duplicate DMs, the system employs a rigid 5-Layer Deduplication Engine:

* **Layer 0 (Webhook Retry Guard):** Meta occasionally retries webhook deliveries. The system caches processed `comment_id`s in memory to silently drop duplicate webhooks within the same session.
* **Layer 1 (Own-Account Filter):** The system strictly ignores any comments made by your own business account (e.g., `@example_business_account` or `example_instagram_id`) so it never enters an infinite reply loop.
* **Layer 2 (Keyword Match):** Comments are parsed case-insensitively to ensure they contain the exact trigger word configured in the dashboard.
* **Layer 3 (In-Memory RAM Check):** Before sending a DM, the system constructs a composite key (`UserID_PostID`). It checks the RAM cache (which takes <0.001ms) to see if this user has *ever* received a DM for this specific post.
* **Layer 4 (Google Sheets Persistence):** Once a DM is sent, the composite key is permanently logged to a Google Sheet. Whenever the server reboots (e.g., during deployments), it downloads this entire sheet back into RAM. **Result: Memory is never lost, and duplicates are mathematically impossible.**

> **Note:** Because deduplication is segmented by `Post ID`, a user *will* be ignored if they comment twice on the same post, but they *will* successfully receive a new DM if they comment on a entirely different post with a different product link.

---

## 📈 Scalability & Load Capacity

This architecture is deliberately designed to handle massive viral traffic for accounts with **100,000+ followers**. 

* **Node.js Event Loop:** Node.js can easily handle hundreds of overlapping network requests per second. A viral spike of 500-1,000 comments in a few minutes is effortlessly processed asynchronously.
* **Memory Footprint (RAM):** The deduplication engine stores keys as tiny strings (e.g., `123456789_987654321`). Storing 100,000 unique DM records consumes less than **5 MB of RAM**. It can easily run on a standard 512 MB server instance without memory bloat.
* **API Rate Limits:**
  * **Instagram:** Graph API limits scale dynamically with follower count. For large accounts, sending DMs via `comment_id` is officially supported and grants massive bandwidth.
  * **Google Sheets:** The system writes to Google Sheets *after* the DM is sent (background processing) so Google API rate limits never slow down the instant DM delivery to the user.
* **Anti-Spam Compliance:** Public replies are randomly rotated from an array of different strings to prevent Instagram's automated spam filters from shadow-banning the account for posting identical comments sequentially.

---

## ⚙️ Environment Configuration

To run this application, the following environment variables are required:

### Instagram / Meta
* `IG_APP_ID`: Your Meta App ID
* `IG_APP_SECRET`: Your Meta App Secret
* `IG_ACCESS_TOKEN`: Long-lived Page Access Token
* `IG_BUSINESS_ACCOUNT_ID`: Your Instagram Professional Account ID (e.g., `example_instagram_id`)
* `IG_WEBHOOK_VERIFY_TOKEN`: A custom string used to verify Meta's webhook handshake.

### Google Sheets (Database)
* `GOOGLE_SHEET_ID`: The ID from your Google Sheet URL.
* `GOOGLE_SERVICE_ACCOUNT_EMAIL`: GCP Service Account Email.
* `GOOGLE_SERVICE_ACCOUNT_KEY_B64`: Base64 encoded JSON key for the GCP Service Account.

### Cloudinary (Image Hosting)
* `CLOUDINARY_CLOUD_NAME`
* `CLOUDINARY_API_KEY`
* `CLOUDINARY_API_SECRET`

---

## 🚀 Deployment Recommendations

For production environments handling consistent traffic:
1. **Server Host:** Render, Heroku, or AWS EC2.
2. **Keep-Alive:** If using a platform like Render, it is highly recommended to use a **paid tier (e.g., Starter Tier)**. Free tiers put the server to "sleep" after 15 minutes of inactivity, which can cause a 10-15 second delay for the very first comment that wakes the server up. A paid tier ensures 24/7 instant millisecond response times.
