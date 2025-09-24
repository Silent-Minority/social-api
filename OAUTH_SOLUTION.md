# Twitter OAuth Token Solution for Mirancourt API

## Problem
OAuth callbacks from X/Twitter aren't reaching our server at `https://api.mirancourt.com/auth/x/callback`, preventing automatic token storage despite successful OAuth start flows.

## Solution
I've created a manual token insertion system that bypasses the callback issue entirely.

## Steps to Get Tweets Posting Immediately

### Step 1: Obtain Twitter OAuth Tokens Manually

Since the OAuth callback isn't reaching our server, you need to obtain the tokens manually:

1. **Visit the OAuth start URL**: `https://api.mirancourt.com/auth/x/start`
2. **Complete the Twitter authorization** (you've confirmed this works)
3. **Capture the callback URL**: When Twitter redirects to the callback, even though it doesn't reach our server, the URL will contain the authorization code:
   ```
   https://api.mirancourt.com/auth/x/callback?code=YOUR_AUTH_CODE&state=YOUR_STATE
   ```
4. **Extract the authorization code** from the URL

### Step 2: Exchange Code for Tokens (Manual)

Since our callback handler can't process the code, you need to exchange it manually. You can use a tool like Postman, curl, or any API client:

```bash
# Exchange the authorization code for tokens
curl -X POST "https://api.twitter.com/2/oauth2/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "Authorization: Basic $(echo -n 'YOUR_CLIENT_ID:YOUR_CLIENT_SECRET' | base64)" \
  -d "grant_type=authorization_code" \
  -d "code=YOUR_AUTH_CODE" \
  -d "redirect_uri=https://api.mirancourt.com/auth/x/callback" \
  -d "code_verifier=YOUR_CODE_VERIFIER"
```

**Note**: You'll need the `code_verifier` that was generated during the OAuth start flow. This is stored in cookies, so check your browser's developer tools.

### Step 3: Insert Tokens Into Our Database

🔒 **SECURITY UPDATE**: The admin endpoints are now secured with ADMIN_TOKEN authentication.

First, set the ADMIN_TOKEN environment variable in Replit Secrets with a secure random string.

Then use our manual insertion endpoint with authentication:

```bash
# Method 1: Using X-Admin-Token header (recommended)
curl -X POST https://api.mirancourt.com/api/admin/insert-tokens \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: YOUR_ADMIN_TOKEN" \
  -d '{
    "access_token": "YOUR_ACCESS_TOKEN",
    "refresh_token": "YOUR_REFRESH_TOKEN", 
    "expires_in": 7200,
    "scope": "tweet.read tweet.write users.read offline.access",
    "twitter_user_id": "YOUR_TWITTER_USER_ID",
    "twitter_username": "Mirancourt"
  }'

# Method 2: Using admin_token in body (alternative)
curl -X POST https://api.mirancourt.com/api/admin/insert-tokens \
  -H "Content-Type: application/json" \
  -d '{
    "admin_token": "YOUR_ADMIN_TOKEN",
    "access_token": "YOUR_ACCESS_TOKEN",
    "refresh_token": "YOUR_REFRESH_TOKEN", 
    "expires_in": 7200,
    "scope": "tweet.read tweet.write users.read offline.access",
    "twitter_user_id": "YOUR_TWITTER_USER_ID",
    "twitter_username": "Mirancourt"
  }'
```

✅ **Enhanced Security Features**:
- Token validation before database insertion prevents bad state
- Admin authentication prevents unauthorized access
- Validates token matches provided user ID and username

### Step 4: Test Tweet Posting

🔒 **SECURITY UPDATE**: Admin endpoints now require authentication.

Test that the setup works:

```bash
# Test with our secured admin endpoint
curl -X POST https://api.mirancourt.com/api/admin/test-tweet \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: YOUR_ADMIN_TOKEN" \
  -d '{"text": "Test tweet via manual setup 🚀"}'

# Test the main API endpoint (for Airtable integration)
curl -X POST https://api.mirancourt.com/api/posts \
  -H "Content-Type: application/json" \
  -d '{"text": "Testing the pipeline 🚀"}'
```

Expected response:
```json
{
  "id": "tweet_id", 
  "url": "https://twitter.com/Mirancourt/status/tweet_id"
}
```

## Alternative: Environment Variable Approach

**❌ REMOVED - INCORRECT INFORMATION**

~~Previous versions incorrectly suggested using `TWITTER_BEARER_TOKEN` (app-only authentication) for posting tweets. This is not possible as app-only tokens cannot post tweets - only user access tokens obtained via OAuth can post tweets.~~

**✅ CORRECT**: Only user access tokens from OAuth flow can post tweets. Use the manual token insertion method above.

## Verification

Check that tokens were inserted correctly:

```bash
curl https://api.mirancourt.com/api/status
```

You should see connected accounts in the response.

## Production Recommendations

1. **Fix OAuth callback routing**: Check DNS, load balancer, or firewall rules blocking the callback
2. **Remove admin endpoints**: The `/api/admin/*` endpoints are temporary and should be removed in production
3. **Add proper authentication**: The manual endpoints should require authentication
4. **Monitor token expiration**: Implement automatic token refresh monitoring

## Technical Details

- **User ID**: `7126459b-1411-4767-84ec-93625a44f067` (Mirancourt user already exists in database)
- **Endpoint Format**: Fixed to return `{"id": "tweet_id", "url": "https://twitter.com/username/status/tweet_id"}`
- **Token Storage**: Uses `social_accounts` table with automatic refresh capability
- **Error Handling**: Returns proper error messages in expected format

The system is now ready to post tweets successfully via the `/api/posts` endpoint!