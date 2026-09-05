# 🚀 Kyro Panel — Complete Step-by-Step Commands Guide

Yeh guide Kyro Panel project ko start se finish tak run karne ke saare zaroori commands ko step-by-step explain karti hai.

---

## 📋 Table of Contents
1. [Initial Setup](#1-initial-setup)
2. [Starting Dev Server (Frontend + Backend)](#2-starting-dev-server)
3. [Starting Agora Voice Agent (Tunnel & AI Panel)](#3-starting-agora-voice-agent)
4. [Stopping the Agent & Teardown](#4-stopping-the-agent--teardown)
5. [Git Workflow Commands](#5-git-workflow-commands)
6. [Self-Checks & Verification](#6-self-checks--verification)
7. [Important Troubleshooting Notes](#7-important-troubleshooting-notes)
8. [Deploy to Render (Tunnel se chhutkara)](#8-deploy-to-render)

---

## 1. Initial Setup

Agar project fresh clone kiya hai ya dependencies update karni hain:

```bash
# 1. Dependencies install karein
npm install

# 2. Environment file setup karein (agar .env exist nahi karta)
cp .env.example .env
```

> **Note:** `.env` file me apni Agora credentials, Gemini/OpenAI API key aur keys configure karein.

---

## 2. Starting Dev Server

### Option A: Sab kuch ek sath start karein (Recommended)
```bash
npm run dev
```
- **Backend Server**: `http://localhost:8787`
- **Frontend Web UI**: `http://localhost:3000`

---

### Option B: Alag-alag terminals me start karna ho
- **Terminal 1 (Backend Server only):**
  ```bash
  npm run dev:server
  ```
- **Terminal 2 (Frontend Web only):**
  ```bash
  npm run dev:web
  ```

---

## 3. Starting Agora Voice Agent

Voice AI Panel ko call me laane ke liye **3 steps** follow karein:

### Step 1: Tunnel Start Karein (Terminal 2)
Agora Cloud me chalta hai, isliye localhost ko expose karna padta hai:
```bash
npm run tunnel
```
> Yeh command ek public URL print karega (Jaise: `https://xyz-random.trycloudflare.com`).

---

### Step 2: `.env` me URL Update Karein
`.env` file kholein aur `ORCHESTRATOR_URL` ko tunnel wale URL se replace karein:
```env
ORCHESTRATOR_URL=https://xyz-random.trycloudflare.com
```

---

### Step 3: Pehle Sign In Karein (Browser)

> **Order matter karta hai.** Agent ka greeting join request me bake hota hai, isliye
> agent start karne se **pehle** candidate ko sign in karna hai. Tabhi panel naam
> lekar shuru karta hai: *"Hi Anish, thanks for making the time…"*

1. Browser me open karein: **`http://localhost:3000`**
2. Login screen par bharein:
   - **Full Name** — panel isi naam se bulayega
   - **Interviewing For** — list me se role chunein, ya **"Other — type it in"** select karke apna role likhein
   - **Resume** *(optional)* — PDF / TXT / MD. Browser me hi padha jaata hai, file kahin upload nahi hoti. Panel iske andar ke real projects aur numbers par sawal poochta hai.
3. **Sign In** dabayein. Room khulega.

---

### Step 4: Agent Start Karein (Terminal 3)
```bash
npm run agent:start -w server
```

**Output example:**
```text
candidate  Anish Patankar — Senior Backend Engineer
resume     1843 chars
agent started
  agent_id: A44CE69KA24VH27PA28AF34HJ27DC86L
  channel : demo-channel
```
*(⚠️ **Important**: `agent_id` ko copy karke rakhein, agent stop karne ke liye iski zaroorat padegi).*

> Agar `candidate  nobody has signed in yet` dikhe, matlab Step 3 miss ho gaya —
> agent stop karke, sign in karke, dobara start karein.

---

### Step 5: Interview Shuru Karein
1. Room me **"Join AI Panel"** button dabayein.
2. Microphone allow karein.
3. Panel khud introduce karta hai aur *"introduce yourself"* se shuru karta hai — bolna start karein.

---

## 4. Stopping the Agent & Teardown

Jab interview khatam ho jaye, agent ko channel se bahar nikaalne ke liye:

```bash
npm run agent:stop -w server -- <AGENT_ID>
```
**Example:**
```bash
npm run agent:stop -w server -- A44CE69KA24VH27PA28AF34HJ27DC86L
```

---

## 5. Git Workflow Commands

```bash
# Saare remote updates & branches fetch karein
git fetch --all --prune

# Saari local & remote branches check karein
git branch -a

# Current branch par latest code pull karein
git pull

# Kisi specific branch par switch karein
git checkout <branch-name>
```

---

## 6. Self-Checks & Verification

Bina network ya live Agora call ke local logic aur scenario verification test karne ke liye:

```bash
# Server checks & scenario simulation suite
npm run check -w server

# Frontend build check
npm run build -w web
```

---

## 7. Important Troubleshooting Notes

| Problem | Cause | Solution |
| :--- | :--- | :--- |
| **AI Panel bol nahi raha (Silent)** | `ORCHESTRATOR_URL` mismatch | `npm run tunnel` restart hone par naya URL deta hai. `.env` me naya URL daal kar agent restart karein. |
| **401 Unauthorized / 503 Error** | Missing `ORCHESTRATOR_API_KEY` | `.env` me `ORCHESTRATOR_API_KEY` set karein (koi bhi secret string). |
| **Microphone not working** | Browser permissions | Browser settings me jakar `localhost:3000` ke liye mic allow karein. |
| **Panel generic sawal poochta hai, naam nahi leta** | Agent sign-in se pehle start ho gaya | Agent stop karein, browser me sign in karein, phir `agent:start` chalayein. |

---

## 8. Deploy to Render

Tunnel har restart par naya URL deta hai aur har baar `.env` edit karna padta hai. Deploy karne
par URL permanent ho jaata hai — ek baar set karo, phir kabhi haath mat lagao.

> **Serverless par deploy mat karna (Vercel / Netlify functions).** Panel pura interview
> memory me rakhta hai (`server/src/panel/model.ts`) aur `/events` ek long-lived SSE stream
> hai. Cold start ya multi-instance dono interview beech me tod dete hain.

### Step 1: Code push karein
```bash
git push origin main
```
`render.yaml` repo root me hai — Render usko khud padh lega.

### Step 2: Render par Blueprint banayein
1. [render.com](https://render.com) par **New → Blueprint**
2. Repo select karein. Render `render.yaml` detect karke 6 secrets maangega:
   `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE`, `ORCHESTRATOR_API_KEY`,
   `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`
   (values apni local `.env` se copy karein)
3. Deploy. URL milega, jaise `https://kyro-panel.onrender.com`

> Agora ke RESTful credentials (`AGORA_CUSTOMER_ID` / `AGORA_CUSTOMER_SECRET`) yahan
> **nahi** jaate — wo sirf `agent.ts` padhta hai, jo aapki apni machine par chalta hai.

### Step 3: Local `.env` me deployed URL daalein
```env
SERVER_URL=https://kyro-panel.onrender.com
ORCHESTRATOR_URL=https://kyro-panel.onrender.com
```
Bas. Ab `npm run tunnel` ki zaroorat nahi.

### Step 4: Interview chalayein
1. Deployed URL browser me kholein — web app aur API dono wahin se aate hain
2. Sign in karein (naam, role, resume)
3. Local terminal se agent start karein:
   ```bash
   npm run agent:start -w server
   ```
4. Room me **Join AI Panel** dabayein

### ⚠️ Free tier ka catch
Render ka free plan **15 minute idle ke baad sleep** kar jaata hai — cold start ~50s lagta hai
aur in-memory session udd jaata hai. Demo se 2-3 minute pehle URL khol kar warm kar lein
(`/health` hit karna kaafi hai), ya `render.yaml` me `plan: free` ko `plan: starter` kar dein.

```bash
# Demo se pehle warm-up
curl https://kyro-panel.onrender.com/health
```

### ⚠️ Open endpoint
`POST /candidate` par koi secret nahi hai (browser ke paas secret ho hi nahi sakta). Throwaway
tunnel URL par ye chhoti baat thi, permanent public URL par koi bhi candidate profile
overwrite kar sakta hai. Sizes capped hain aur resume prompt me fenced data hai, par public
demo se pehle ispar rate-limit lagana chahiye.
