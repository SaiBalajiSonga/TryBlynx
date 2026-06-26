# Lynxus — The Grand UI Polish (v2)

## What This Plan Does

Transform Lynxus from a "backend-first prototype" into a **polished, installable, cross-platform app** that feels fast, looks like nothing else out there, and earns users' trust from the first second — phone, tablet, desktop, as a website *and* as an installable PWA app.

---

## Research Summary

### What Real Users Want (2025–2026)

| What Users Love ❤️ | What Users Hate 💀 |
|---|---|
| **Instant-on simplicity** — one tap to start chatting | Cluttered interfaces with too many buttons |
| **Speed is a feature** — if it feels sluggish, they uninstall in 10 seconds | Apps that look like every other chat app (Discord clones, Emerald clones) |
| **Warm, human design** — feels like a safe place, not a tech product | Cold, corporate, "AI-generated" looking interfaces |
| **Micro-animations + subtle sounds** that confirm actions | Static UIs that feel "dead" and unresponsive |
| **Cross-platform** — same quality on phone and desktop | Apps that only work well on one screen size |
| **Trust through transparency** — clear safety, E2EE, no hidden tracking | Mystery about what the app does with your data |
| **Accessibility as baseline** — high contrast, keyboard nav, screen readers | Apps that ignore a11y entirely |

### Why People Come to Random Chat Apps

The research is clear: people come to apps like Lynxus because they're **lonely, curious, or socially anxious** — NOT because they want another social media platform. They want:

- A place where they can be themselves without judgment
- The thrill of meeting someone new without the pressure of dating apps
- Human connection that feels real, not algorithmic
- A safe environment that doesn't make them feel worse than before

> [!IMPORTANT]
> **Our landing page and brand tone must connect with these feelings honestly — not with marketing hype.** We don't sell features. We acknowledge the emotion, then show we've built something that respects it.

### Why Lynxus is Different (vs Omegle/Emerald Chat)

| | Omegle (RIP) | Emerald Chat | **Lynxus** |
|---|---|---|---|
| Safety | None — wild west | Basic reporting | **AI moderation + shadowbanning + E2EE DMs** |
| Privacy | IP-exposed | Account required | **Anonymous guest mode + E2EE by default** |
| Quality | 90% bots/spam | 70% bots | **Matchmaking filters + interest-based matching** |
| Experience | Outdated UI, ads | Discord clone UI | **Unique warm design, no ads, ever** |
| Speed | Slow, Flash-era | Decent | **WebSocket-native, sub-100ms messaging** |
| Trust | Zero | Minimal | **Open about safety, visible moderation, E2EE badges** |

This comparison drives the **landing page messaging** — we don't trash competitors, we show what *we* do differently through simple, honest statements.

---

## Resolved Decisions (from your feedback)

| Question | Decision |
|---|---|
| Color palette | **NOT indigo/violet.** Research-backed unique palette (see Phase 1) |
| Layout change | ✅ Persistent sidebar desktop + bottom nav mobile |
| PWA-first | ✅ One codebase, installable everywhere |
| Brand identity | Build from scratch — name analysis + color psychology |
| Sound effects | ✅ Gen-Z appropriate — subtle, satisfying, never annoying |
| Landing page tone | **Trust-building, not advertising.** Connect with insecurities, earn trust honestly |
| Icons | **Custom icon system** — unique to Lynxus brand (see Phase 3) |

---

## Proposed Changes

### Phase 1 — The Lynxus Color Identity

> [!IMPORTANT]
> This is the most critical decision. Every pixel in the app flows from this.

#### The Name "Blynx" — What It Tells Us

"Blynx" combines "B" (likely "be" or a personal touch) with **"Lynx"** — the wild cat. Etymologically, "lynx" comes from Greek *lýnx*, connected to "to see" and "to shine." The lynx is known for:

- **Keen sight** — seeing what others miss (finding real connections)
- **Warmth** — a creature of forests, not ice
- **Agility** — fast, sharp, responsive
- **Mystery** — enigmatic but not threatening

This gives us our design direction: **warm, perceptive, agile, natural.**

#### The Palette: "Midnight Ember"

After researching what users love in 2025-2026 dark themes, the research consistently says:
- Move away from pure black and cold blue-grays
- Use warm-tinted dark surfaces that feel "cozy, not corporate"
- Choose accent colors that feel human and organic, not AI-generated
- Use the 60-30-10 rule: 60% dark surface, 30% secondary surface, 10% accent

Here's the palette I've designed, inspired by the warmth of embers and the electric energy of a lynx's eyes:

```
SURFACES (The "Midnight" — warm-tinted blacks)
──────────────────────────────────────────────
--surface-0: #0a0a0f     Deep midnight (base)
--surface-1: #0f1016     Sidebar / panels (slight warm purple tint)
--surface-2: #161720     Cards / elevated (charcoal with warmth)
--surface-3: #1e1f2a     Inputs / hover states
--surface-4: #282938     Active / pressed states

ACCENT PRIMARY — "Ember Teal"
──────────────────────────────────────────────
--accent: #14b8a6        A warm teal — NOT the cold cyan of tech apps
--accent-hover: #0d9488  Deeper teal on hover
--accent-glow: rgba(20, 184, 166, 0.20)
--accent-dim: rgba(20, 184, 166, 0.08)
--accent-gradient: linear-gradient(135deg, #14b8a6, #2dd4bf)

Why teal? Research shows teal bridges "trust" (blue) and "growth" (green)
without being corporate blue or cliché green. It's the color of tropical
water, bioluminescence, a lynx's reflective eyes at night. Warm enough
to feel human, cool enough to feel modern.

ACCENT SECONDARY — "Coral Spark"  
──────────────────────────────────────────────
--coral: #f97066         Warm coral for notifications, warnings, energy
--coral-dim: rgba(249, 112, 102, 0.10)

Why coral? It pairs beautifully with teal (complementary on the color
wheel), adds warmth and urgency without the harshness of pure red.
Research calls it "friendly urgency."

SEMANTIC COLORS
──────────────────────────────────────────────
--success: #34d399       Mint green (online, connected, sent)
--warning: #fbbf24       Warm amber (pending, caution)
--error: #f87171         Soft red (error, danger)

TEXT HIERARCHY
──────────────────────────────────────────────
--text-1: #f0f0f5        Primary — warm white, NOT pure #fff
--text-2: #9ca3af        Secondary — readable muted
--text-3: #4b5563        Tertiary — timestamps, hints
```

**Why this works:**
- **Not Discord** (blue-gray + blurple)
- **Not Emerald Chat** (green + dark gray)
- **Not "AI vibes"** (indigo-violet)
- **Not generic** — the teal-coral-midnight combination is distinctive
- **Passes WCAG AA** contrast ratios at every level
- **Feels warm** even in dark mode — the slight warm tint in surfaces matters

#### [MODIFY] [index.css](file:///c:/Users/JOHNSON/Desktop/Lynxus/frontend/src/index.css)

Complete rewrite with the new Midnight Ember token system. Also includes:

**Typography:**
- Primary: **Inter** (variable font, best screen rendering, industry standard for apps)
- Mono: **JetBrains Mono** (for E2EE indicators, code, timestamps)
- Type scale: 12/13/14/16/20/24/32/48px with consistent line-height ratios

**Spacing scale:** 4/8/12/16/20/24/32/48/64px

**Radius scale:** 6/10/16/24/9999px (small→full)

**Transitions:**
- `--ease-out`: `cubic-bezier(0.16, 1, 0.3, 1)` — for elements leaving
- `--ease-spring`: `cubic-bezier(0.34, 1.56, 0.64, 1)` — for elements entering (springy)
- Duration tokens: `120ms` (fast hover), `200ms` (normal), `350ms` (slow/entrance)

**Animation Library:**
- `slide-up`, `slide-down`, `scale-in`, `fade-in` — entrance animations
- `shake` — error feedback
- `skeleton-pulse` — loading placeholders
- `ripple` — match search radar
- Staggered entrance system via `[data-animate]` with CSS custom delays

**Component Primitives (CSS classes, replacing inline styles):**
- `.btn` + `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger`
- `.input` with focus ring, error state, disabled state
- `.card` with hover lift + teal border glow
- `.badge` for notifications, status
- `.avatar` with sizes (sm/md/lg) + presence dot
- `.skeleton` for loading states

---

### Phase 2 — Responsive Layout Revolution

#### [MODIFY] [Dashboard.tsx](file:///c:/Users/JOHNSON/Desktop/Lynxus/frontend/src/components/Dashboard.tsx)

**New Layout Architecture:**

```
Desktop (≥1024px)
┌──────────┬────────────────────────────────────┐
│          │  TopBar (48px — logo + notif + pfp) │
│ Sidebar  ├────────────────────────────────────┤
│ (fixed   │                                    │
│  240px)  │       Main Content (fluid)         │
│          │                                    │
└──────────┴────────────────────────────────────┘

Mobile (<1024px)
┌───────────────────┐
│ TopBar (48px)     │
├───────────────────┤
│                   │
│   Main Content    │
│   (full width)    │
│                   │
├───────────────────┤
│ 🏠  💬  🎥  👥  ✉️ │
│ Bottom Tab Bar    │
└───────────────────┘
```

- **Desktop**: Persistent sidebar, no hamburger menu needed. Content never obscured.
- **Mobile**: Bottom tab bar with 5 core actions. Thumb-friendly. Safe area insets for notched phones.
- **Tablet**: Sidebar collapses to 64px icon-only rail.
- Header thins to 48px — just logo + notifications + profile avatar.
- All inline `style={{}}` → CSS classes.
- Decompose the 396-line monolith into: `AppShell.tsx`, `TopBar.tsx`, `DesktopSidebar.tsx`, `BottomNav.tsx`, `NotificationPanel.tsx`, `ProfileDropdown.tsx`

#### [NEW] `frontend/src/components/BottomNav.tsx`

Mobile-only bottom navigation:
- 5 tabs: Home, Chat, Video, Groups, DMs
- Active state: teal dot below icon + label appears
- Unread badge on DMs/notifications tabs
- `navigator.vibrate(10)` on tap (subtle haptic)
- `env(safe-area-inset-bottom)` for notched phones
- Slides up on mount, spring animation

#### [MODIFY] [Sidebar.tsx](file:///c:/Users/JOHNSON/Desktop/Lynxus/frontend/src/components/Sidebar.tsx)

Desktop-only persistent sidebar:
- 240px wide, fixed position
- User card at top with avatar + status
- Navigation items with teal active indicator
- Connection status (WS) at bottom — subtle, not alarming
- Collapsible to 64px icon rail for tablet
- All inline styles → CSS classes

---

### Phase 3 — The Blynx Icon System

> [!IMPORTANT]
> Creating a unique icon style is what separates a "generic app" from a "brand." Here's the research-backed strategy.

#### Icon Style: "Rounded Duotone"

After researching 2025-2026 icon trends, the best fit for Lynxus is a **rounded duotone** style:

| Property | Value | Why |
|---|---|---|
| **Style** | Rounded outline + filled accent shape | Duotone adds depth and brand recognition without the complexity of full illustration |
| **Grid** | 24px base grid | Standard for UI icons, scales well to 16px and 32px |
| **Stroke** | 2px, round caps, round joins | Feels softer and friendlier than 1.5px sharp icons (which feel "corporate") |
| **Corner radius** | 3px on all corners | Consistent with the app's rounded UI aesthetic |
| **Primary color** | `var(--text-2)` when inactive | Blends naturally into the interface |
| **Accent fill** | `var(--accent)` at 15% opacity | The duotone "fill" — a subtle teal shape inside the outline. THIS is what makes them unique |
| **Active state** | Full `var(--accent)` outline + 25% fill | Clear active/selected indicator |

**How duotone works:**
```
Inactive:                Active:
┌─────────┐             ┌─────────┐
│  ╭───╮  │             │  ╭───╮  │
│  │░░░│  │  ──────►    │  │▓▓▓│  │
│  ╰───╯  │             │  ╰───╯  │
│  gray    │             │  teal   │
└─────────┘             └─────────┘
```

The outline is always visible. The inner fill changes opacity on active/hover. This is subtle but VERY recognizable once users see it — it becomes "the Blynx look."

#### Implementation Strategy

**Phase 3a — Core Navigation Icons (custom SVGs):**
Create 10 custom SVG icons in the Blynx duotone style:
- Home, Chat, Video, Group, DMs, Search, Settings, Profile, Notifications, Mod

**Phase 3b — Utility Icons (Lucide with wrapper):**
For the ~40 utility icons (Send, Lock, Check, X, Plus, etc.), we keep Lucide React but wrap them in a `<BlynxIcon>` component that applies:
- Consistent sizing (defaulting to 20px)
- Consistent stroke width (2px)
- Consistent color tokens
- Optional duotone fill for key icons

**Phase 3c — App Icon / Logo:**
- The Lynxus logo: A stylized lynx eye (the "keen sight" theme) rendered in the teal-to-mint gradient
- Simple enough to work as a 16px favicon AND a 512px PWA icon
- Recognizable in silhouette

#### [NEW] `frontend/src/components/icons/` directory

Contains all custom Blynx icons as React components:
- `BlynxIcon.tsx` — wrapper component with size/color/active props
- `NavIcons.tsx` — 10 core navigation icon SVGs
- `Logo.tsx` — the Lynxus wordmark + icon

---

### Phase 4 — Page-by-Page Redesign

#### [MODIFY] [LandingPage.tsx](file:///c:/Users/JOHNSON/Desktop/Lynxus/frontend/src/components/LandingPage.tsx)

**Current:** Generic "The new way to hang out online" with 3 feature cards.

**New Approach — Trust-First, Not Advertising:**

The landing page should feel like a **conversation, not a billboard.** It connects with the user's actual emotional state:

```
Section 1: "The Hook" (emotional connection)
────────────────────────────────────────────
Headline: "Tired of talking to bots?"
Subhead:  "Yeah, us too. Lynxus connects you with real people.
           No bots. No ads. No BS."

[Start Chatting →]  [Continue as Guest]

(Mesh gradient background with warm teal glow, subtle particle float)
```

```
Section 2: "The Proof" (simple, honest facts)
────────────────────────────────────────────
Not a feature grid. Three honest statements:

🔒 "Your DMs are end-to-end encrypted. 
    We literally can't read them."

🤖 "AI moderation runs on every chat. 
    Bad actors get shadowbanned silently."

⚡ "Messages arrive in under 100ms. 
    Faster than you can blink."

(Each statement appears on scroll with a simple fade-up)
```

```
Section 3: "The Difference" (vs the competition, without naming them)
────────────────────────────────────────────
"You've tried random chat before."
"You know the problems."

Three side-by-side cards:
❌ "90% bots"          → ✅ "Real people, filtered by interests"
❌ "No safety"          → ✅ "AI moderation + E2EE + shadowban"
❌ "Creepy & outdated"  → ✅ "Clean design, no ads, ever"
```

```
Section 4: "The Invite" (warm CTA)
────────────────────────────────────────────
"Still not sure? Try it as a guest.
 No email. No signup. Just click."

[Start as Guest →]

Live counter: "X people online right now" (from WebSocket)
```

```
Footer: Terms · Privacy · "Built with care, not venture capital"
```

**Design details:**
- Animated mesh gradient hero (CSS `@property` animation — no JS canvas)
- Staggered text reveal on load (0.1s delay per element)
- Scroll-triggered reveals for sections 2-4
- Mobile: stacks naturally, all text left-aligned
- NO stock photos, NO abstract illustrations — just clean text + icons + space

---

#### [MODIFY] [AuthForm.tsx](file:///c:/Users/JOHNSON/Desktop/Lynxus/frontend/src/components/AuthForm.tsx)

- **Desktop**: Split layout — brand message on left ("Your next conversation starts here"), form on right
- **Mobile**: Full-screen form with compact brand header
- Animated transition between Login ↔ Register (horizontal slide, not instant)
- Password strength indicator (color bar under password field)
- Inline field validation (error appears below field, not as a top banner)
- Submit button morphs to progress circle while loading
- Brief success animation (teal checkmark bloom) before redirect
- Guest login gets visual parity — same size button, clear "No signup needed" label

---

#### [MODIFY] [Home.tsx](file:///c:/Users/JOHNSON/Desktop/Lynxus/frontend/src/components/Home.tsx)

- **Greeting**: "Good evening, {name}" with time-of-day awareness
- **Quick Actions**: 3 large cards (Text Chat, Video Chat, Groups) with the new Blynx duotone icons and gradient hover borders
- **Activity ribbon**: "X people online now" live counter
- **Online friends**: Horizontal avatar scroll (if user has friends)
- All cards use the new design system: `surface-2` background, teal glow on hover, rounded-lg

---

#### [MODIFY] [TextChat.tsx](file:///c:/Users/JOHNSON/Desktop/Lynxus/frontend/src/components/TextChat.tsx)

- Matchmaking screen: immersive full-screen experience
  - Animated radar ripple in teal (CSS keyframes, not canvas)
  - Rotating micro-copy: "Scanning the globe...", "Finding someone cool...", "Almost there..."
  - Match elapsed counter
  - Match found → coral spark animation + satisfying chime sound
- Chat room: new bubble design (see ChatRoom below)

---

#### [MODIFY] [DMs.tsx](file:///c:/Users/JOHNSON/Desktop/Lynxus/frontend/src/components/DMs.tsx)

- **Mobile responsive**: DM list and chat are separate views (not side-by-side)
- DM list gets search/filter input at top
- Consistent bubble design with ChatRoom
- E2EE indicator: subtle lock icon in input placeholder, NOT a top banner
- Typing indicator: smoother bouncing dots animation
- All 595 lines of inline styles → CSS classes
- Decompose into: `DMList.tsx`, `DMChat.tsx`, `MessageBubble.tsx`, `ChatInput.tsx`

---

#### [MODIFY] [ChatRoom.tsx](file:///c:/Users/JOHNSON/Desktop/Lynxus/frontend/src/components/ChatRoom.tsx)

New message bubble design (shared across TextChat, DMs, GroupChat):
- My messages: teal gradient background (`accent → accent-hover`)
- Their messages: `surface-3` background
- Bubble entrance: slide-up + fade (0.15s, staggered)
- Group messages: avatar beside first message of a cluster
- "Scroll to bottom" floating button when scrolled up
- Skeleton loaders while messages load
- Connection status bar: thin colored line at top (green/yellow/red)

---

#### [MODIFY] [Settings.tsx](file:///c:/Users/JOHNSON/Desktop/Lynxus/frontend/src/components/Settings.tsx)

- **Tabbed navigation**: Account | Matchmaking | Appearance | Privacy
- **Appearance tab**: Theme preference (dark/light/system — dark is default), accent color preview
- **Privacy tab**: E2EE key backup, data export, account deletion
- **Account tab**: Avatar, display name, bio, gender
- **Matchmaking tab**: Location, language, interests
- Each tab is its own card section with proper spacing

---

#### [MODIFY] [GroupChat.tsx](file:///c:/Users/JOHNSON/Desktop/Lynxus/frontend/src/components/GroupChat.tsx)

- Group list: proper cards with member count, last active, group avatar
- Active group: collapsible member sidebar (desktop), bottom sheet (mobile)
- Decompose into: `GroupList.tsx`, `GroupRoom.tsx`, `MemberPanel.tsx`

---

#### [MODIFY] [VideoChat.tsx](file:///c:/Users/JOHNSON/Desktop/Lynxus/frontend/src/components/VideoChat.tsx) + [VideoRoom.tsx](file:///c:/Users/JOHNSON/Desktop/Lynxus/frontend/src/components/VideoRoom.tsx)

- Self-view: PiP (small, draggable, rounded corners)
- Floating control bar: mute, camera toggle, end call, chat overlay toggle
- Connection quality indicator (signal bars)
- Full-screen mode toggle

---

### Phase 5 — Sound Design & Micro-Interactions

#### Sound Design (Gen-Z Approved)

Based on the research: Gen-Z wants sounds that are **functional, subtle, and brand-unique.** They hate loud/obnoxious/generic sounds. They love haptic + audio combos.

| Event | Sound Character | Duration | Haptic |
|---|---|---|---|
| **Message sent** | Soft "whoosh" upward — air-like, light | ~150ms | `vibrate(8)` — gentle tap |
| **Message received** | Gentle "plop" — like a water drop landing | ~200ms | `vibrate(12)` — subtle |
| **Match found** | Rising double-tone — celebratory but chill, like Tinder's match but warmer | ~400ms | `vibrate([15, 50, 15])` — double pulse |
| **Match searching** | Quiet, ambient low hum (looping) — barely audible, creates tension | Loop | None |
| **Notification** | Single soft bell/chime — distinct from iOS/Android defaults | ~250ms | `vibrate(10)` |
| **Error** | Low, muted "bonk" — not alarming, just "nope" | ~150ms | `vibrate(20)` |
| **Button click** | Near-silent click/tap — more felt than heard | ~50ms | `vibrate(5)` |

**Implementation:**
- All sounds are 48kHz WAV files, compressed to ~5KB each
- Wrapped in a `useSound()` hook with volume control
- Respects user's system "silent mode" — checks `navigator.vibrate` availability
- Global mute toggle in Settings → Appearance
- Sounds are preloaded on first user interaction (to comply with autoplay policies)

#### [NEW] `frontend/src/lib/sounds.ts`

Sound manager module:
- Preload audio sprites on first interaction
- `playSound('sent' | 'received' | 'match' | 'error' | 'click' | 'notification')`
- `setVolume(0-1)` and `setMuted(boolean)`
- Reads preference from localStorage

#### [NEW] `frontend/public/sounds/` directory

Audio files for all interaction sounds.

#### Micro-Animations

| Interaction | Animation | Timing |
|---|---|---|
| Send message | Bubble slides up from input, slight scale overshoot | 200ms spring |
| Receive message | Bubble fades in + subtle translateY(-4px → 0) | 180ms ease-out |
| Match found | Radar pulses merge → peer card expands from center | 500ms spring |
| Navigate panels | Content cross-fades (opacity) | 200ms ease |
| Button press | Scale 0.97 → 1.0 on release | 120ms spring |
| Sidebar toggle | Content pushes/pulls (transform) | 250ms ease-out |
| Notification arrive | Bell icon rotates 15° → back + badge scales in from 0 | 300ms spring |
| Online dot | Smooth color transition (red → amber → green) | 400ms ease |
| Typing indicator | 3 dots with 0.2s staggered bounce | Loop |
| Skeleton loader | Shimmer sweep left-to-right | 1.5s linear loop |

All animations respect `prefers-reduced-motion: reduce` — they simplify to instant transitions.

---

### Phase 6 — PWA: Installable Everywhere

#### [NEW] `frontend/public/manifest.json`

```json
{
  "name": "Lynxus",
  "short_name": "Blynx",
  "description": "Meet real people. No bots. No BS.",
  "start_url": "/app",
  "display": "standalone",
  "background_color": "#0a0a0f",
  "theme_color": "#14b8a6",
  "orientation": "any",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ],
  "shortcuts": [
    { "name": "Start Chatting", "url": "/app/text-chat" },
    { "name": "Messages", "url": "/app/dms" }
  ]
}
```

#### [NEW] `frontend/public/sw.js`

Service worker:
- App Shell caching (HTML, CSS, JS, fonts)
- Offline fallback page ("You're offline — messages will sync when you reconnect")
- Push notification support (for match found, new DM)
- Background sync queue for messages sent offline

#### [MODIFY] [index.html](file:///c:/Users/JOHNSON/Desktop/Lynxus/frontend/index.html)

Add:
- `<link rel="manifest" href="/manifest.json">`
- `<meta name="description" content="Meet real people. No bots. No BS.">`
- `<meta name="theme-color" content="#14b8a6">`
- `<meta name="apple-mobile-web-app-capable" content="yes">`
- Apple touch icons, og:image, og:title, og:description
- `<title>Lynxus — Meet Real People</title>`
- Service worker registration
- Preconnect hints for API + fonts CDN

#### [MODIFY] [vite.config.ts](file:///c:/Users/JOHNSON/Desktop/Lynxus/frontend/vite.config.ts)

Add `vite-plugin-pwa` for automatic SW generation + manifest injection.

---

### Phase 7 — Performance, Accessibility & Code Quality

#### Performance

**Skeleton Loaders** — replace spinner icons with content-shaped placeholders:
- DM conversation list (3 placeholder rows)
- Message history (alternating left/right bubble shapes)
- Group list (card placeholders)
- User search results
- Profile loading

**Virtual Scrolling** — for message lists with 100+ messages:
- Only render visible messages + 20-message buffer
- Smooth scroll position preservation
- Critical for DMs and group chats

**Optimistic UI:**
- Send message → show immediately with "sending" state, confirm on WS ack
- Friend request → button updates instantly
- Match cancel → instant idle return

**Code Splitting:**
- Already have vendor/icons chunks
- Add: settings chunk, group-chat chunk, video chunk (lazy-loaded routes)

#### Accessibility

- All interactive elements: `aria-label`, `role`, `tabindex`
- Focus trap in modals
- Keyboard navigation for sidebar, chat, DMs
- `prefers-reduced-motion` → disable all animations
- `prefers-color-scheme` → future light mode support
- Minimum 4.5:1 contrast ratio everywhere (verified with the Midnight Ember palette)
- Screen reader announcements: new message, match found, notification

#### SEO (Landing Page)

- `<title>` and `<meta description>` per route
- Open Graph + Twitter Card tags
- Semantic HTML: `<header>`, `<main>`, `<nav>`, `<footer>`, `<article>`
- Single `<h1>` per page
- JSON-LD structured data on landing page

#### Kill All Inline Styles

The single biggest code quality win. Every component currently uses `style={{}}`, which:
- Cannot be cached by the browser
- Cannot use `:hover`, `:focus`, `::before`, `@media`
- Makes components 3-5x longer than needed
- Causes style recalculation on every render

**Strategy:** Migrate to Tailwind utility classes + CSS custom properties. Monolith components shrink dramatically:
- `Dashboard.tsx` (396 lines) → ~120 lines as `AppShell.tsx`
- `DMs.tsx` (595 lines) → ~150 lines as `DMChat.tsx` + `DMList.tsx`
- `GroupChat.tsx` (623 lines) → ~180 lines across 3 files

#### Shared Component Library

Reusable components extracted during refactor:
- `<Avatar>` — sizes sm/md/lg, presence dot, VIP ring
- `<Button>` — primary/secondary/ghost/danger variants
- `<Input>` — label, error, icon prefix, focus ring
- `<Modal>` — backdrop, animation, focus trap, a11y
- `<Badge>` — notification count, status indicator
- `<Skeleton>` — configurable loading shapes
- `<Toast>` — redesigned with teal/coral/amber variants
- `<EmptyState>` — consistent empty state messaging

---

## Implementation Order

| Phase | What | Est. Effort | Priority |
|---|---|---|---|
| **Phase 1** | Color System + Design Tokens | 1 day | 🔴 Everything depends on this |
| **Phase 2** | Responsive Layout (Sidebar + BottomNav) | 2-3 days | 🔴 Biggest UX improvement |
| **Phase 3** | Blynx Icon System | 1-2 days | 🟡 Brand differentiator |
| **Phase 4** | Page-by-Page Redesign | 4-5 days | 🟡 The visible polish |
| **Phase 5** | Sound Design + Animations | 1-2 days | 🟡 Makes it feel alive |
| **Phase 6** | PWA Setup | 1 day | 🟢 Cross-platform reach |
| **Phase 7** | Performance + A11y + Code Quality | 3-4 days | 🟢 Foundation for scale |

**Total estimated: 13-18 days of focused work.**

---

## Verification Plan

### Automated Tests
```bash
cd frontend && npm run build    # Build succeeds
npx tsc --noEmit                # Type checking passes
npm run lint                    # Lint passes
```

### Manual Verification
- **Lighthouse audit**: 90+ for Performance, Accessibility, Best Practices, SEO
- **PWA installability**: "Add to Home Screen" on Chrome Android, Safari iOS, Chrome Desktop
- **Responsive**: 375px (iPhone SE) → 390px (iPhone 14) → 768px (iPad) → 1024px (laptop) → 1440px (desktop)
- **Animation FPS**: 60fps verified in Chrome DevTools Performance panel
- **Offline**: DevTools Network → Offline → verify cached shell loads
- **Cross-browser**: Chrome, Firefox, Safari, Edge
- **Accessibility**: axe-core audit, VoiceOver/NVDA screen reader test
- **Sound check**: Test all audio cues at different volumes, test silent mode
- **Color contrast**: Run entire palette through WebAIM contrast checker
