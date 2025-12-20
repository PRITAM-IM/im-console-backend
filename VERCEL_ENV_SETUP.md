# 🔐 Vercel Environment Variables Configuration

## Copy these to your Vercel Dashboard
**Project Settings → Environment Variables**

---

## 🗄️ Database Configuration

```bash
# MongoDB Connection String
# Get this from MongoDB Atlas → Connect → Connect your application
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/hotel-analytics?retryWrites=true&w=majority
```

---

## 🔑 Authentication & Security

```bash
# JWT Secret - Generate a strong random string
# Use: openssl rand -base64 32
JWT_SECRET=your-super-secret-jwt-key-min-32-chars

# JWT Expiration
JWT_EXPIRES_IN=7d
```

---

## 🌐 Frontend Configuration

```bash
# Production Frontend URL (for CORS)
FRONTEND_URL=https://hotelmoguls.com

# Alternative: If using Vercel for frontend
# FRONTEND_URL=https://client-hotel-dashboard.vercel.app
```

---

## 🔵 Google Services

### Google OAuth2 & Analytics
```bash
# Get from: https://console.cloud.google.com/apis/credentials
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret

# Update this with your actual Vercel backend URL
GOOGLE_REDIRECT_URL=https://your-backend.vercel.app/api/google/callback
```

### Google Ads
```bash
# Get Developer Token from: https://ads.google.com/aw/apicenter
GOOGLE_ADS_DEVELOPER_TOKEN=your-developer-token

# Update this with your actual Vercel backend URL
GOOGLE_ADS_REDIRECT_URL=https://your-backend.vercel.app/api/google-ads/callback
```

### Google Places API
```bash
# Get from: https://console.cloud.google.com/apis/credentials
GOOGLE_PLACES_API_KEY=your-places-api-key
```

---

## 🔵 Meta/Facebook Services

```bash
# Get from: https://developers.facebook.com/apps
META_APP_ID=your-meta-app-id
META_APP_SECRET=your-meta-app-secret

# Update this with your actual Vercel backend URL
META_ADS_REDIRECT_URI=https://your-backend.vercel.app/api/meta-ads/callback
```

---

## 🤖 AI Services (Optional but Recommended)

### OpenAI Configuration
```bash
# Get from: https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-your-openai-api-key

# Model to use for AI analysis
OPENAI_MODEL=gpt-4-turbo

# Maximum tokens per request
OPENAI_MAX_TOKENS=2000
```

### Pinecone Vector Database (for RAG)
```bash
# Get from: https://app.pinecone.io/
PINECONE_API_KEY=your-pinecone-api-key

# Index name (must match what you created)
PINECONE_INDEX_NAME=hotel-analytics-metrics
```

---

## 🔧 System Configuration

```bash
# Node Environment (always production on Vercel)
NODE_ENV=production

# Optional: Port (Vercel handles this automatically)
# PORT=3000
```

---

## 📋 Quick Setup Checklist

### Before Adding to Vercel:

1. **MongoDB Atlas Setup:**
   - [ ] Create cluster at https://cloud.mongodb.com
   - [ ] Create database user
   - [ ] Whitelist IP: `0.0.0.0/0` (all IPs) for Vercel
   - [ ] Copy connection string to `MONGODB_URI`

2. **Google Cloud Console Setup:**
   - [ ] Create project at https://console.cloud.google.com
   - [ ] Enable APIs: Analytics Data API, Google Ads API, Places API
   - [ ] Create OAuth 2.0 credentials
   - [ ] Add authorized redirect URIs (your Vercel backend URL)
   - [ ] Copy credentials to environment variables

3. **Meta Developer Setup:**
   - [ ] Create app at https://developers.facebook.com
   - [ ] Add Facebook Login product
   - [ ] Configure OAuth redirect URIs
   - [ ] Copy App ID and Secret

4. **OpenAI Setup (Optional):**
   - [ ] Create account at https://platform.openai.com
   - [ ] Generate API key
   - [ ] Add billing information
   - [ ] Copy API key

5. **Pinecone Setup (Optional):**
   - [ ] Create account at https://www.pinecone.io
   - [ ] Create index with:
     - Dimensions: 1536
     - Metric: cosine
     - Cloud: AWS
     - Region: us-east-1
   - [ ] Copy API key

---

## 🚀 Adding Variables to Vercel

### Method 1: Via Dashboard (Recommended)

1. Go to https://vercel.com/dashboard
2. Select your project
3. Go to **Settings** → **Environment Variables**
4. For each variable:
   - Enter **Key** (e.g., `MONGODB_URI`)
   - Enter **Value** (e.g., your connection string)
   - Select environments: ✅ Production ✅ Preview ✅ Development
   - Click **Save**

### Method 2: Via Vercel CLI

```bash
# Add a single variable
vercel env add MONGODB_URI production

# Pull environment variables to local
vercel env pull .env.local

# List all environment variables
vercel env ls
```

### Method 3: Bulk Import

Create a file `vercel-env.txt` with format:
```
MONGODB_URI=your-value
JWT_SECRET=your-value
GOOGLE_CLIENT_ID=your-value
```

Then import:
```bash
vercel env add < vercel-env.txt
```

---

## ⚠️ Important Security Notes

### DO NOT:
- ❌ Commit `.env` files to Git
- ❌ Share API keys publicly
- ❌ Use the same keys for development and production
- ❌ Hardcode secrets in your code

### DO:
- ✅ Use strong, random secrets for `JWT_SECRET`
- ✅ Rotate API keys regularly (every 90 days)
- ✅ Use different keys for different environments
- ✅ Enable 2FA on all service accounts
- ✅ Monitor API usage for anomalies

---

## 🔍 Verification

After adding all variables, verify they're set correctly:

```bash
# Using Vercel CLI
vercel env ls

# Or check in dashboard
# Settings → Environment Variables
```

You should see all variables listed for Production, Preview, and Development environments.

---

## 🆘 Troubleshooting

### "Environment variable not found"
- Check spelling matches exactly (case-sensitive)
- Ensure variable is added for the correct environment
- Redeploy after adding new variables

### "Invalid MongoDB URI"
- Ensure URI is properly URL-encoded
- Check username/password don't contain special characters
- Verify cluster is running in MongoDB Atlas

### "Google OAuth error"
- Verify redirect URIs match exactly in Google Console
- Check client ID and secret are correct
- Ensure APIs are enabled in Google Cloud Console

### "Meta OAuth error"
- Verify App ID and Secret are correct
- Check redirect URI is whitelisted in Meta App settings
- Ensure app is in "Live" mode (not Development)

---

**Last Updated:** 2025-12-19
**Template Version:** 1.0.0
