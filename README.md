<div align="center">

# 🎬 SyncRoom

### Server-Authoritative Real-Time YouTube Watch Parties

Watch YouTube together with synchronized playback, role-based permissions, and real-time collaboration powered by Socket.IO.

---

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express-5-000000?logo=express)](https://expressjs.com/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4-010101?logo=socket.io)](https://socket.io/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite)](https://vitejs.dev/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**Live Demo:** https://syncroom-gamma.vercel.app/

**Backend API:** https://syncroom-2l50.onrender.com/

</div>

---

# 📖 Overview

SyncRoom is a production-inspired **server-authoritative watch party platform** that enables multiple users to watch YouTube videos together while remaining perfectly synchronized.

Unlike traditional watch-party applications where every client controls its own playback, SyncRoom keeps the server as the single source of truth.

Every play, pause, seek, role update, participant removal, and synchronization event is validated by the backend before being broadcast to connected participants.

The project was built to demonstrate production software engineering practices including:

- Server-authoritative state management
- Real-time communication using Socket.IO
- Role-based authorization
- Responsive frontend architecture
- Production deployment
- Typed event contracts
- Modern React architecture

# ✨ Features

### 🎥 Server-Authoritative Playback

The server owns the playback state for every room. Clients never synchronize directly with each other, ensuring a consistent viewing experience across all participants.

---

### ⚡ Real-Time Synchronization

Playback events are synchronized using **Socket.IO** with:

- Play / Pause
- Seek
- Playback position recovery
- Late participant synchronization
- Role updates
- Room membership updates

---

### 👥 Role-Based Permissions

Every room supports three permission levels:

| Role | Permissions |
|------|-------------|
| **Host** | Full control over playback, participant management, moderator assignment, host transfer |
| **Moderator** | Playback control and video selection |
| **Participant** | Watch synchronized playback with no control over shared state |

---

### 🔎 Integrated YouTube Discovery

Browse YouTube without leaving the application.

Features include:

- Search
- Trending categories
- Sports
- Music
- Movies
- Technology
- Podcasts
- Education
- Travel
- Food
- Animation
- Live streams

Hosts and Moderators can instantly synchronize any discovered video for the entire room.

---

### 📺 Shared Playback Experience

Every participant watches the same video timeline with:

- Server-authoritative synchronization
- Shared playback state
- Playback recovery after reconnect
- Fullscreen viewing
- Live playback progress

---

### 🧑‍🤝‍🧑 Live Room Management

Manage participants in real time:

- Promote Participant → Moderator
- Transfer Host ownership
- Remove participants
- Automatic room cleanup
- Presence synchronization

---

### 🎨 Modern User Experience

- Dark Theme
- Light Theme
- Responsive Design
- Mobile Friendly
- Accessible Keyboard Navigation
- Professional Dashboard Interface

---

### 🚀 Production Ready

- Express 5
- Socket.IO
- TypeScript
- React + Vite
- Zod Validation
- Helmet Security
- Pino Logging
- Render Deployment
- Vercel Deployment

# 📸 Application Preview

## Landing Page

![Landing Page](README-assets/landing-page.png)

---

## Synchronized Watch Room

![SyncRoom Dashboard](README-assets/syncroom-dashboard.png)

---

## YouTube Discovery

![YouTube Discovery](README-assets/youtube-discovery-dashboard.png)

---

## Role Management

![Role Management](README-assets/role-management.png)

---

## Light Theme

![Light Theme](README-assets/syncroom-light-theme.png)

---

## Mobile Experience

<p align="center">
  <img src="README-assets/syncroom-mobile-view.jpeg" width="320" alt="Mobile View"/>
</p>

---

## System Architecture

![Architecture](README-assets/syncroom-architecture.png)

# 🛠️ Technology Stack

| Category | Technologies |
|-----------|--------------|
| **Frontend** | React 19, TypeScript, Vite |
| **Styling** | CSS3, Responsive Design |
| **Backend** | Node.js, Express 5 |
| **Real-Time Communication** | Socket.IO |
| **Validation** | Zod |
| **Security** | Helmet, CORS |
| **Logging** | Pino, Pino HTTP |
| **Video Platform** | YouTube IFrame API, YouTube Data API v3 |
| **Build Tools** | TypeScript, tsx |
| **Deployment** | Vercel (Frontend), Render (Backend) |
| **Version Control** | Git, GitHub |

# 📂 Project Structure

```text
syncroom/
│
├── client/                 # React + TypeScript frontend
│   ├── src/
│   │   ├── components/
│   │   ├── features/
│   │   ├── lib/
│   │   ├── hooks/
│   │   ├── types/
│   │   └── App.tsx
│   └── package.json
│
├── server/                 # Express + Socket.IO backend
│   ├── src/
│   │   ├── config/
│   │   ├── realtime/
│   │   ├── routes/
│   │   ├── modules/
│   │   └── server.ts
│   └── package.json
│
├── README-assets/
├── README.md
└── package.json
```

# ⚙️ Engineering Architecture

SyncRoom follows a **server-authoritative architecture**, where the backend is the single source of truth for room state and playback synchronization.

Instead of clients communicating directly with one another, every playback action is first validated by the server before being broadcast to all connected participants.

This approach provides:

- Consistent playback synchronization
- Predictable room state
- Simplified conflict resolution
- Secure role-based authorization
- Better scalability for future persistence

The synchronization flow is:

```text
Host Action
      │
      ▼
Socket.IO Event
      │
      ▼
Express + Room Service
      │
Validate Permission
      │
Update Room State
      │
Broadcast Updated State
      │
Participants Synchronize Player
```

# 🚀 Getting Started

## Prerequisites

Before running SyncRoom locally, ensure you have:

- Node.js 22+
- npm
- A YouTube Data API v3 Key

---

## Clone the Repository

```bash
git clone https://github.com/harshdeepsingh888-ps/syncroom.git

cd syncroom
```

---

## Install Dependencies

```bash
npm install
```

---

## Configure Environment Variables

### Server

Create:

```text
server/.env
```

```env
NODE_ENV=development
PORT=4000
CLIENT_ORIGIN=http://localhost:5173
YOUTUBE_DATA_API_KEY=YOUR_API_KEY
```

---

### Client

Create:

```text
client/.env
```

```env
VITE_SERVER_URL=http://localhost:4000
```

---

## Start Development

Backend

```bash
npm run dev:server
```

Frontend

```bash
npm run dev:client
```

Open:

```
http://localhost:5173
```

# 🧪 Testing

The project includes automated testing for core backend functionality.

Run:

```bash
npm test
```

Type checking:

```bash
npm run typecheck
```

Production build:

```bash
npm run build
```

The test suite covers:

- YouTube Search API
- Playback Synchronization
- Role Management
- Host Transfer
- Participant Removal
- Authorization Rules

# 🧪 Testing

The project includes automated testing for core backend functionality.

Run:

```bash
npm test
```

Type checking:

```bash
npm run typecheck
```

Production build:

```bash
npm run build
```

The test suite covers:

- YouTube Search API
- Playback Synchronization
- Role Management
- Host Transfer
- Participant Removal
- Authorization Rules

# 🛣️ Future Roadmap

Version 2 is planned to include:

- User Authentication
- Public & Private Rooms
- Join Approval Workflow
- Playlist Queue
- Real-Time Chat
- Emoji Reactions
- Watch History
- PostgreSQL Persistence
- Redis Synchronization
- Rate Limiting
- API Response Caching
- OAuth Login
- Analytics Dashboard

# 🙏 Acknowledgements

This project was developed as a software engineering assignment to demonstrate:

- Real-Time System Design
- Backend Architecture
- Frontend Engineering
- Production Deployment
- Software Engineering Best Practices

Special thanks to the open-source community behind:

- React
- Express
- Socket.IO
- TypeScript
- Vite
- YouTube Data API

# 📄 License

This project is licensed under the MIT License.