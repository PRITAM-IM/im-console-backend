# 🚀 Vercel Deployment Guide

## ✅ Pre-Deployment Checklist

### 1. **Configuration Files** ✅
- [x] `vercel.json` - Fixed (removed conflicting builds/routes)
- [x] `package.json` - Updated with Node.js version and proper build script
- [x] `api/index.ts` - Added timeout handling
- [x] `src/config/db.ts` - Optimized MongoDB connection pooling

### 2. **Test Build Locally**
```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Test TypeScript compilation
npm run build

# Check for TypeScript errors
npx tsc --noEmit
```

### 3. **Environment Variables Setup**

Before deploying, configure these environment variables in your Vercel dashboard:

#### **Required Variables:**

```bash
# Database
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority

# JWT Authentication
JWT_SECRET=<generate-strong-random-secret-here>
JWT_EXPIRES_IN=7d

# Frontend URL (for CORS)
FRONTEND_URL=https://hotelmoguls.com

# Node Environment
NODE_ENV=production
```

#### **Google Services:**

```bash
# Google OAuth2
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URL=https://your-backend.vercel.app/api/google/callback

# Google Ads
GOOGLE_ADS_DEVELOPER_TOKEN=your-developer-token
GOOGLE_ADS_REDIRECT_URL=https://your-backend.vercel.app/api/google-ads/callback

# Google Places API
GOOGLE_PLACES_API_KEY=your-places-api-key
```

#### **Meta/Facebook Services:**

```bash
# Meta App Configuration
META_APP_ID=your-meta-app-id
META_APP_SECRET=your-meta-app-secret
META_ADS_REDIRECT_URI=https://your-backend.vercel.app/api/meta-ads/callback
```

#### **AI Services (Optional but Recommended):**

```bash
# OpenAI Configuration
OPENAI_API_KEY=sk-your-openai-api-key
OPENAI_MODEL=gpt-4-turbo
OPENAI_MAX_TOKENS=2000

# Pinecone Vector Database (for RAG)
PINECONE_API_KEY=your-pinecone-api-key
PINECONE_INDEX_NAME=hotel-analytics-metrics
```

---

## 📦 Deployment Steps

### **Option 1: Deploy via Vercel CLI (Recommended)**

```bash
# Install Vercel CLI globally (if not already installed)
npm install -g vercel

# Login to Vercel
vercel login

# Deploy to preview environment
vercel

# Deploy to production
vercel --prod
```

### **Option 2: Deploy via GitHub Integration**

1. Push your code to GitHub
2. Go to [Vercel Dashboard](https://vercel.com/dashboard)
3. Click "Add New Project"
4. Import your GitHub repository
5. Configure environment variables in the dashboard
6. Deploy!

---

## ⚙️ Vercel Dashboard Configuration

### **1. Project Settings**

- **Framework Preset:** Other (Express.js)
- **Root Directory:** `backend`
- **Build Command:** `npm run vercel-build` (or leave empty, it auto-detects)
- **Output Directory:** Leave empty (serverless functions)
- **Install Command:** `npm install`

### **2. Function Settings**

Your `vercel.json` already configures:
- ✅ **Max Duration:** 60 seconds (requires Pro plan)
- ✅ **Memory:** 1024 MB
- ✅ **Region:** Auto (or specify in dashboard)

**Note:** If you're on the **Hobby plan**, the max duration is **10 seconds**. You'll need to upgrade to **Pro** for 60-second timeouts.

### **3. Environment Variables**

Add all variables from the checklist above in:
**Project Settings → Environment Variables**

**Important:**
- Add variables for **Production**, **Preview**, and **Development** environments
- Never commit `.env` files to Git
- Use `.env.example` as a template

---

## 🔍 Post-Deployment Verification

### **1. Health Check**
```bash
curl https://your-backend.vercel.app/api/health
```

Expected response:
```json
{
  "success": true,
  "message": "Hotel Analytics Cockpit API is running"
}
```

### **2. Check Logs**

View real-time logs in Vercel dashboard:
- Go to your project
- Click on "Deployments"
- Select your deployment
- Click "Functions" → "api/index.ts" → View logs

### **3. Test Key Endpoints**

```bash
# Test authentication
curl https://your-backend.vercel.app/api/auth/me

# Test Google Analytics (requires auth)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://your-backend.vercel.app/api/analytics/overview
```

---

## 🚨 Common Issues & Solutions

### **Issue 1: "Function Timeout"**
**Symptom:** 504 Gateway Timeout errors

**Solutions:**
1. Upgrade to Vercel Pro for 60s timeout
2. Optimize slow database queries
3. Implement caching for expensive operations
4. Check Pinecone API response times

### **Issue 2: "Module not found"**
**Symptom:** Build fails with missing module errors

**Solutions:**
1. Ensure all dependencies are in `dependencies`, not `devDependencies`
2. Run `npm install` locally to verify
3. Check `tsconfig.json` paths are correct

### **Issue 3: "MongoDB Connection Failed"**
**Symptom:** Database connection errors

**Solutions:**
1. Verify `MONGODB_URI` is correct in Vercel dashboard
2. Whitelist Vercel IPs in MongoDB Atlas (or use `0.0.0.0/0` for all IPs)
3. Check MongoDB Atlas cluster is running
4. Verify network access settings in Atlas

### **Issue 4: "CORS Errors"**
**Symptom:** Frontend can't access API

**Solutions:**
1. Verify `FRONTEND_URL` is set correctly
2. Check `vercel.json` headers configuration
3. Ensure frontend domain is in `allowedOrigins` in `src/app.ts`

### **Issue 5: "Cold Start Delays"**
**Symptom:** First request takes 5-10 seconds

**Solutions:**
1. This is normal for serverless functions
2. Implement warming strategies (cron jobs to ping endpoints)
3. Consider upgrading to Vercel Pro for better cold start performance
4. Optimize bundle size by removing unused dependencies

---

## 📊 Monitoring & Optimization

### **1. Enable Vercel Analytics**
- Go to Project Settings → Analytics
- Enable Web Analytics and Speed Insights

### **2. Monitor Function Execution**
- Check "Functions" tab in deployment details
- Look for:
  - Execution time (should be < 60s)
  - Memory usage (should be < 1024MB)
  - Error rate

### **3. Set Up Error Tracking**
Consider integrating:
- **Sentry** for error tracking
- **LogRocket** for session replay
- **Datadog** for APM

### **4. Performance Optimization**

**Current Optimizations:**
- ✅ Lazy initialization of services
- ✅ Cached MongoDB connections
- ✅ Cached Pinecone client
- ✅ Connection pooling

**Future Optimizations:**
- [ ] Implement Redis caching for API responses
- [ ] Add query result caching for expensive operations
- [ ] Split large services into separate functions
- [ ] Implement CDN caching for static responses

---

## 🔐 Security Best Practices

### **1. Environment Variables**
- ✅ Never commit `.env` files
- ✅ Use strong, random secrets for `JWT_SECRET`
- ✅ Rotate API keys regularly
- ✅ Use different keys for production and development

### **2. API Security**
- ✅ CORS properly configured
- ✅ JWT authentication implemented
- ✅ Rate limiting (consider adding)
- ✅ Input validation (ensure all endpoints validate)

### **3. Database Security**
- ✅ Use MongoDB Atlas with IP whitelisting
- ✅ Enable MongoDB encryption at rest
- ✅ Use strong database passwords
- ✅ Limit database user permissions

---

## 📝 Maintenance Tasks

### **Weekly:**
- Check error logs in Vercel dashboard
- Monitor function execution times
- Review API usage and costs

### **Monthly:**
- Update dependencies: `npm update`
- Review and rotate API keys if needed
- Check for security vulnerabilities: `npm audit`

### **Quarterly:**
- Review and optimize slow endpoints
- Update Node.js version if needed
- Review Vercel plan and usage

---

## 🆘 Support Resources

- **Vercel Documentation:** https://vercel.com/docs
- **Vercel Support:** https://vercel.com/support
- **MongoDB Atlas Support:** https://www.mongodb.com/support
- **Pinecone Support:** https://www.pinecone.io/support

---

## 📞 Emergency Contacts

If deployment fails or production is down:

1. **Check Vercel Status:** https://www.vercel-status.com/
2. **Check MongoDB Atlas Status:** https://status.cloud.mongodb.com/
3. **Rollback to previous deployment** in Vercel dashboard
4. **Contact Vercel support** if issue persists

---

**Last Updated:** 2025-12-19
**Version:** 1.0.0
**Maintained by:** Development Team
