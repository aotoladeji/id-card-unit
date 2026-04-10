# Fingerprint Verification Setup Guide

## Current Status

**✅ Code Infrastructure**: Fingerprint verification endpoint is implemented and working
**❌ Environment Issue**: `CAPTURE_APP_URL` not configured for production on Vercel

## Problem

When fingerprint verification is called in production (Vercel), it fails because:
- Local `.env` has `CAPTURE_APP_URL=http://localhost:5001` (development only)
- Vercel environment variables are **not** set with production capture app URL
- Result: fingerprint verification returns 503 error instead of matching/not matching

## Solution — Configure Vercel Environment Variables

### Step 1: Get Your Production Capture App URL

You need the actual URL/hostname where your capture app is deployed. Examples:
- `http://capture-app.example.com:5001`
- `http://192.168.1.100:5001` (internal IP if on same network)
- `http://capture-service.vercel.app:5001` (if also hosted on Vercel)

**Ask your capture app team for the production endpoint URL.**

### Step 2: Set Environment Variable on Vercel

1. Go to [Vercel Dashboard](https://vercel.com)
2. Select your project: `id-card-unit`
3. Go to **Settings** → **Environment Variables**
4. Add new variable:
   - **Name**: `CAPTURE_APP_URL`
   - **Value**: `http://<YOUR_CAPTURE_APP_HOST>:5001` (replace with actual host)
   - **Environments**: Select `Production` (or all if you prefer)
5. Click **Add**
6. Redeploy project (this will pull the new environment variable)

### Step 3: Verify Configuration

After deployment, check the diagnostic endpoint:

```bash
curl https://id-card-unit.vercel.app/api/diagnostic/capture-app-status
```

You should see:
```json
{
  "success": true,
  "status": "operational",
  "capture_app": {
    "CAPTURE_APP_URL": "http://<your-host>:5001",
    "isProduction": true,
    "VERIFY_API_KEY": "set",
    "environment": "production"
  },
  "captureAppResponse": {
    "statusCode": 200,
    "data": {...}
  }
}
```

## Testing Fingerprint Verification

### Test 1: Check Configuration

```bash
curl https://id-card-unit.vercel.app/api/diagnostic/config
```

### Test 2: Verify Fingerprint Endpoint (requires authentication)

```bash
curl -X POST https://id-card-unit.vercel.app/api/collections/verify-and-collect \
  -H "Authorization: Bearer <YOUR_JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d {
    "id": <collection-id>,
    "scannedFingerprint": "<base64-fingerprint-data>"
  }
```

Expected responses:
- **201**: Fingerprint matched, card collected
- **400**: Fingerprint did not match
- **503**: Capture app misconfigured or unreachable (check CAPTURE_APP_URL)
- **404**: Collection record not found

### Test 3: Local Testing

For local development, keep `CAPTURE_APP_URL=http://localhost:5001` in `.env` and ensure:
1. Capture app is running locally on port 5001
2. Network can reach it (check firewall)
3. Test fingerprint endpoint locally

## Troubleshooting

### "Fingerprint verification is not available in this environment"
- **Cause**: `CAPTURE_APP_URL` not set (still using default localhost)
- **Fix**: Set environment variable on Vercel (see Step 2)

### "Cannot reach capture app at http://localhost:5001"
- **Cause**: Production trying to reach localhost (default fallback)
- **Fix**: Same as above—must set CAPTURE_APP_URL on Vercel

### "Connection refused" or "Cannot resolve hostname"
- **Cause**: `CAPTURE_APP_URL` points to invalid host or app is down
- **Fix**: Verify URL is correct and capture app is running
- **Debug**: Run `/api/diagnostic/capture-app-status` to see exact error

### Fingerprint always fails with "did not match"
- **Cause**: `CAPTURE_APP_URL` is set correctly, but fingerprints don't match
- **Fix**: Verify biometric data is enrolled and scanned correctly
- **Note**: This is normal behavior—fingerprint verification is working, data just doesn't match

## Improved Error Handling

The system now returns different HTTP status codes to distinguish errors:

| Status | Meaning | Action |
|--------|---------|--------|
| 201 | Fingerprint matched | Card collected successfully |
| 400 | Fingerprint didn't match | User should try again |
| 503 | Capture app not configured or unreachable | Admin should set CAPTURE_APP_URL |
| 404 | Collection record not found | Invalid collection ID |

### Response Details

**On configuration error (503):**
```json
{
  "success": false,
  "verified": false,
  "code": "CONFIG_ERROR",
  "message": "Fingerprint verification is not available in this environment...",
  "diagnostic": {
    "captureAppUrl": "http://localhost:5001",
    "instruction": "Set CAPTURE_APP_URL environment variable to production capture app endpoint"
  }
}
```

**On connection error (503):**
```json
{
  "success": false,
  "verified": false,
  "code": "CONNECTION_ERROR",
  "message": "Cannot reach capture app at http://...",
  "diagnostic": {
    "url": "http://...",
    "hint": "Check if capture app is running and CAPTURE_APP_URL is correct"
  }
}
```

**On fingerprint mismatch (400):**
```json
{
  "success": false,
  "verified": false,
  "message": "Fingerprint did not match. Please try again."
}
```

## Complete Deployment Checklist

- [ ] Get production capture app URL from your capture app team
- [ ] Add `CAPTURE_APP_URL` to Vercel environment variables (Settings → Environment Variables)
- [ ] Set it to production value (not localhost)
- [ ] Redeploy project
- [ ] Test `/api/diagnostic/capture-app-status` returns `"status": "operational"`
- [ ] Test fingerprint collection with real card
- [ ] Verify 201 response when fingerprint matches
- [ ] Verify 400 response when fingerprint doesn't match
- [ ] Verify 503 response provides clear diagnostic info if configuration wrong

## Local Development Setup

Make sure your `.env` file has:
```
CAPTURE_APP_URL=http://localhost:5001
VERIFY_API_KEY=2f411ce1c1dafdcf36079620dc3f00b97ec2ca24a7ce87c35b503fe09866c069
```

And ensure:
1. Capture app is running on `http://localhost:5001`
2. Node.js backend is running
3. Test: `curl http://localhost:3000/api/diagnostic/capture-app-status`

## Questions?

- **Fingerprint verification not working?** → Check `/api/diagnostic/config` and `/api/diagnostic/capture-app-status`
- **Can't find capture app URL?** → Ask your capture app team for production endpoint
- **Still failing?** → Check backend logs for detailed error messages in `[Fingerprint]` entries
