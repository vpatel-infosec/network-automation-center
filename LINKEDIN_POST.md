# LinkedIn Post — Network Automation Center

---

🚀 **I built a complete network operations command center — and it's open source.**

As network engineers, we've all been there: spreadsheets for inventory, scattered config files, no audit trail, and topology diagrams drawn on whiteboards. I set out to fix that.

**Network Automation Center** is a full-stack web application that brings device inventory, encrypted credentials, configuration backups, topology discovery, and scheduled automation into **one auditable platform**.

---

### What it actually does:

🔐 **Encrypted Credential Vault**
Reusable credential sets stored with AES-256-GCM encryption. Assign once, use across many devices. Rotate secrets in one place — no more hunting down passwords.

📦 **Multi-Vendor Device Inventory**
Track switches, routers, access points, wireless LAN controllers, and firewalls. Searchable, with connection tests and per-device command overrides.

💾 **Configuration Control & Versioning**
Automatic backups, meaningful version history, line-by-line diffs, templates, and operator-triggered restore/push workflows. Every change is audited.

🗺️ **Topology Discovery**
Discover network links using CDP and LLDP. Verify targets first, then build the topology. Combine results when both protocols are available.

⏰ **Scheduled Automation & Jobs**
Concurrent jobs with live progress, cancellation, cron schedules, and a real-time dashboard. Watch jobs execute as they happen.

📊 **Reports & Exports**
Full-dataset CSV, Excel, and PDF exports from every module. Sensitive data (credentials, config bodies, raw audit details) is excluded from general reports.

👤 **Role-Based Access**
First-user administrator setup with `admin`, `operator`, and `viewer` roles. Registration is restricted after initial bootstrap.

---

### Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, React Router, Vite, Axios |
| **Backend** | Node.js (ESM), Express 4, Socket.IO |
| **Database** | MongoDB 7, Mongoose 8 |
| **Device Connectivity** | SSH via `ssh2`, HTTPS RESTCONF for IOS-XE |
| **Deployment** | Docker Compose, nginx-served frontend |

---

### Why I built this

Network teams need tools that are:
✅ Safe to use on production equipment (read-only by default, review every change)
✅ Auditable (every action logged, every config versioned)
✅ Multi-vendor (not tied to one vendor's ecosystem)
✅ Deployable without cloud dependencies (local or self-hosted)

---

### 👉 Try it / Star it / Fork it
GitHub: https://github.com/virat-hacker/network-automation-center

---

### Questions I'd love to hear from you:
➡️ What's the biggest pain point in your network operations workflow?
➡️ Do you manage multi-vendor environments, or mostly single-vendor?
➡️ What tools do you use today for config backups?

---

#NetworkEngineering #DevOps #Automation #OpenSource #NodeJS #React #MongoDB #Infrastructure #NetworkAutomation #SysAdmin #OpenSourceSoftware #SideProject #WebDevelopment #TechCommunity

---

## Carousel Post Outline (for LinkedIn carousel)

Slide 1 — Hook:
"Spreadsheets for network inventory? Scattered config files? No audit trail?
I built a fix. 🧵"

Slide 2 — The Problem:
"Network ops teams struggle with:
▸ Manual, error-prone inventory
▸ Credentials stored in spreadsheets
▸ No config versioning
▸ Whiteboard topology diagrams
▸ No automation scheduling"

Slide 3 — The Solution:
"Network Automation Center
A complete command center for network operations:
▸ Inventory ▸ Credentials ▸ Configs
▸ Topology ▸ Automation ▸ Reports"

Slide 4 — Feature Deep Dive 1:
"🔐 Encrypted Credential Vault
• AES-256-GCM encryption at rest
• Reusable credential sets
• Assign to multiple devices
• Rotate secrets in one place"

Slide 5 — Feature Deep Dive 2:
"💾 Configuration Control
• Automatic backups
• Version history with diffs
• Templates
• Restore/push workflows
• Full audit trail"

Slide 6 — Feature Deep Dive 3:
"🗺️ Topology Discovery
• CDP + LLDP link discovery
• Target verification
• Combined results
• Visual topology maps"

Slide 7 — Feature Deep Dive 4:
"⏰ Scheduled Automation
• Concurrent jobs
• Live progress tracking
• Job cancellation
• Cron schedules
• Real-time dashboard"

Slide 8 — Tech Stack:
"Frontend: React 18 + Vite
Backend: Express 4 + Socket.IO
Database: MongoDB 7
Connectivity: SSH (ssh2) + RESTCONF
Deployment: Docker Compose + nginx"

Slide 9 — Why It Matters:
"Built for teams that need:
✅ Safe operations (read-only by default)
✅ Full auditability
✅ Multi-vendor support
✅ Self-hosted deployment"

Slide 10 — Call to Action:
"Open source on GitHub:
github.com/virat-hacker/network-automation-center

⭐ Star it | 🔁 Share it | 🍴 Fork it

What's your biggest network ops pain point? 👇"