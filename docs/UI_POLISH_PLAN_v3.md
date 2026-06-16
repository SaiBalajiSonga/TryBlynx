# TryBlynx — The Grand UI Polish (v3)

Target users: 18–40, meeting strangers via random text/video chat. This
version folds in three fixes from the v2 review: in-call safety UX gets
its own phase, sound defaults to off, and a user-testing checkpoint sits
between Phase 4 and Phase 5 instead of only at the very end.

---

## What This Plan Does

Transform TryBlynx from a "backend-first prototype" into a polished,
installable, cross-platform app — phone, tablet, desktop, website and
PWA — that feels fast, looks distinct, and earns trust in the first ten
seconds, especially in the moment that matters most for this product:
the seconds right after a stranger appears on screen.

---

## Research Summary (unchanged from v2, kept for context)

People come to random chat apps because they're lonely, curious, or
socially anxious — not because they want another social platform. They
want a place to be themselves without judgment, the thrill of meeting
someone new without dating-app pressure, and a safe environment that
doesn't make them feel worse than before.

> [!IMPORTANT]
> The landing page and brand tone connect with these feelings honestly,
> not with marketing hype. We don't sell features — we acknowledge the
> emotion, then show we've built something that respects it. The same
> honesty has to extend past the landing page into the moment a stranger
> actually shows up — that's the real trust test, not the homepage copy.

### Why TryBlynx is different (vs Omegle/Emerald Chat)

| | Omegle (RIP) | Emerald Chat | **TryBlynx** |
|---|---|---|---|
| Safety | None | Basic reporting | AI moderation + shadowbanning + E2EE + **in-call report/block (see Phase 0)** |
| Privacy | IP-exposed | Account required | Anonymous guest mode + E2EE by default |
| Quality | 90% bots/spam | 70% bots | Matchmaking filters + interest-based matching |
| Experience | Outdated UI, ads | Discord clone UI | Distinct warm design, no ads, ever |
| Speed | Slow, Flash-era | Decent | WebSocket-native, sub-100ms messaging |
| Trust | Zero | Minimal | Visible safety controls *in the moment*, not just on a marketing page |

---

## Resolved Decisions

| Question | Decision |
|---|---|
| Color palette | Teal/coral "Midnight Ember" — see caveat in Phase 1 notes |
| Layout | Persistent sidebar desktop + bottom nav mobile |
| PWA-first | One codebase, installable everywhere |
| Sound | **Off by default everywhere, opt-in on first message** (changed from v2) |
| Landing page tone | Trust-building, not advertising |
| Icons | Custom duotone system |
| Safety UX | **Gets its own phase, ships before Phase 4 polish, not after** (new in v3) |
| User testing | **Informal 5-person check after Phase 4, before Phase 5/6/7** (new in v3) |

---

## Phase 0 — In-Call & In-Chat Safety UX (NEW — ships first, before visual polish)

> [!IMPORTANT]
> This is the actual trust-builder for this audience — more than any
> E2EE badge on the landing page. A stranger showing up on a video call
> is the single highest-anxiety moment in the product. The backend
> already has `BlockUserHandler`, `UnblockUserHandler`, `ReportUserHandler`,
> and strike/shadowban logic (`internal/api/moderation_handlers.go`) — none
> of it is exposed inside an active match. This phase is pure frontend
> wiring against existing endpoints, which makes it cheap relative to
> its trust impact. Do this before Phase 4's cosmetic pass so the
> redesigned chat/video screens are built around safety controls from
> the start, not retrofitted.

### What ships

- **Always-visible report/block button** inside `ChatRoom.tsx` and
  `VideoRoom.tsx` — not buried in a menu. One tap, no confirmation
  friction for blocking (block is reversible and low-stakes); report
  asks for a one-line reason via a bottom sheet, not a full form.
- **A leave/skip action that is faster than the current one.** Today's
  leave flow round-trips `match.leave` + `chat.leave` (see backend —
  this is correct and was already fixed for double-broadcast bugs).
  The fix needed here is purely perceptual: the button must be reachable
  with zero scroll and zero modal, ideally a single fixed-position
  control that's visually distinct from "send message" so a panicked
  tap doesn't miss.
- **Pre-match content notice**, shown once per session before first
  match: "You'll be randomly matched with someone. Report or block
  anytime — top-right." Dismissible, never shown again that session.
- **Post-report confirmation that doesn't dead-end the user** — after
  reporting, automatically advance to the next match (don't leave them
  staring at a frozen disconnected screen waiting for input).
- **Visible moderation status, not just backend shadowbanning.** If a
  user's account is shadowbanned (already implemented server-side),
  surface *something* age-appropriate in Settings — not "you are
  shadowbanned" (that just teaches evasion), but a generic "your account
  is under review" state that explains reduced matching without
  revealing the mechanism.

### What does NOT ship in Phase 0

- Age verification (flagged as an open decision below — needs a product
  call, not an engineering one).
- Video/audio recording for report evidence (privacy and storage
  implications too large for this phase; flag for legal review first).

### Files touched

- `ChatRoom.tsx`, `VideoRoom.tsx` — add report/block controls, wire to
  existing `/api/moderation/block` and `/api/moderation/report`.
- `TextChat.tsx` — pre-match notice, post-report auto-advance.
- `Settings.tsx` — generic account-status surface (Privacy tab, see
  Phase 4).

---

## Phase 1 — The TryBlynx Color Identity

#### The Name "Blynx"

"Blynx" combines "B" with "Lynx" — keen sight, warmth, agility, mystery.
Design direction: warm, perceptive, agile, natural.

#### The Palette: "Midnight Ember"

```
SURFACES (warm-tinted blacks)
--surface-0: #0a0a0f     Deep midnight (base)
--surface-1: #0f1016     Sidebar / panels
--surface-2: #161720     Cards / elevated
--surface-3: #1e1f2a     Inputs / hover states
--surface-4: #282938     Active / pressed states

ACCENT PRIMARY — "Ember Teal"
--accent: #14b8a6
--accent-hover: #0d9488
--accent-glow: rgba(20, 184, 166, 0.20)
--accent-dim: rgba(20, 184, 166, 0.08)
--accent-gradient: linear-gradient(135deg, #14b8a6, #2dd4bf)

ACCENT SECONDARY — "Coral Spark"
--coral: #f97066
--coral-dim: rgba(249, 112, 102, 0.10)

SEMANTIC
--success: #34d399
--warning: #fbbf24
--error: #f87171

TEXT
--text-1: #f0f0f5
--text-2: #9ca3af
--text-3: #4b5563
```

> [!NOTE]
> **Caveat carried over from the v2 review, not resolved by this plan:**
> teal+coral is one of the most common "distinctive" palettes in
> 2025–2026 app design — it's close to a default in current
> Tailwind/shadcn-adjacent design culture. The reasoning "not violet, not
> blue, not green, therefore teal" is elimination, not genuine novelty.
> Ship this palette (the tokens and 60-30-10 structure are sound
> regardless of hue), but treat the *specific* hue choice as provisional
> — see the open decision in the appendix below asking whether to
> commission a genuinely uncommon accent (e.g. warm amber-gold, or a
> desaturated rose) before final lock-in. Don't let this block Phase 1;
> the token *system* matters more than the exact hex values, and hues
> are a find-and-replace away from changing later if needed.

**Typography:** Inter (variable), JetBrains Mono for E2EE/timestamps.
Type scale 12/13/14/16/20/24/32/48px. Spacing 4/8/12/16/20/24/32/48/64px.
Radius 6/10/16/24/9999px.

**Transitions:** `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)`,
`--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1)`. Durations 120/200/350ms.

**Component primitives:** `.btn` (+primary/secondary/ghost/danger),
`.input`, `.card`, `.badge`, `.avatar`, `.skeleton`.

#### [MODIFY] `frontend/src/index.css` — full token rewrite as above.

---

## Phase 2 — Responsive Layout Revolution

#### [MODIFY] `Dashboard.tsx` (395 lines → split)

```
Desktop (≥1024px)                    Mobile (<1024px)
┌──────────┬─────────────────┐       ┌───────────────────┐
│          │ TopBar (48px)   │       │ TopBar (48px)      │
│ Sidebar  ├─────────────────┤       ├───────────────────┤
│ (240px)  │                 │       │                   │
│          │  Main Content   │       │   Main Content    │
│          │                 │       │                   │
└──────────┴─────────────────┘       ├───────────────────┤
                                      │ 🏠 💬 🎥 👥 ✉️      │
                                      └───────────────────┘
```

- Decompose into `AppShell.tsx`, `TopBar.tsx`, `DesktopSidebar.tsx`,
  `BottomNav.tsx`, `NotificationPanel.tsx`, `ProfileDropdown.tsx`.
- Tablet: sidebar collapses to 64px icon rail.
- All inline `style={{}}` → CSS classes.

#### [NEW] `BottomNav.tsx`
5 tabs (Home, Chat, Video, Groups, DMs), teal active dot, unread badges,
`navigator.vibrate(10)` on tap, `env(safe-area-inset-bottom)`.

#### [MODIFY] `Sidebar.tsx`
240px fixed, user card, nav items, WS connection status (subtle, not
alarming), collapsible to 64px rail.

---

## Phase 3 — The Blynx Icon System

**Style:** Rounded duotone — 2px stroke, round caps/joins, 24px grid,
3px corner radius. Inactive: `var(--text-2)` outline + 15% accent fill.
Active: full accent outline + 25% fill.

- **Phase 3a:** 10 custom SVGs (Home, Chat, Video, Group, DMs, Search,
  Settings, Profile, Notifications, Mod).
- **Phase 3b:** Lucide React for ~40 utility icons, wrapped in
  `<BlynxIcon>` for consistent size/stroke/color.
- **Phase 3c:** App icon — stylized lynx eye, teal-to-mint gradient,
  works at 16px favicon and 512px PWA icon.

#### [NEW] `frontend/src/components/icons/` — `BlynxIcon.tsx`,
`NavIcons.tsx`, `Logo.tsx`.

> [!TIP]
> Start Phase 3a in parallel with Phase 2, not strictly after Phase 1.
> Only the 10 core nav icons gate Phase 2's sidebar/bottom-nav work;
> utility icons (3b) can land any time before Phase 4 needs them. This
> is one of the parallelization opportunities flagged in the timeline
> section — don't treat the phase numbers as a strict serial queue.

---

## Phase 4 — Page-by-Page Redesign

#### `LandingPage.tsx`

Trust-first structure (Hook → Proof → Difference → Invite), unchanged
in spirit from v2:

```
Section 1 — Hook: "Tired of talking to bots?" / "Yeah, us too..."
Section 2 — Proof: 3 honest statements (E2EE, AI moderation, <100ms)
Section 3 — Difference: 3 before/after cards, no competitor names
Section 4 — Invite: guest CTA + live online counter
Footer: Terms · Privacy · "Built with care, not venture capital"
```

> [!NOTE]
> Section 2's "AI moderation runs on every chat" claim now has a real
> in-product anchor (Phase 0), not just a marketing line — when a user
> actually sees the report button on their first match, the landing
> page promise and the product experience match. This consistency is
> worth more than the copy itself.

Animated mesh gradient hero (CSS `@property`, no JS canvas), staggered
text reveal, scroll-triggered fades, no stock photos.

#### `AuthForm.tsx`
Split layout desktop / full-screen mobile, animated login↔register
slide, password strength bar, inline validation, guest login visual
parity with signup.

#### `Home.tsx`
Time-aware greeting, 3 quick-action cards with duotone icons, live
online counter, online-friends avatar scroll.

#### `TextChat.tsx`
Matchmaking screen: CSS radar ripple, rotating micro-copy, match
counter. Match found → coral spark + chime (respecting the new
sound-off-by-default rule — see Phase 5).

#### `DMs.tsx` (594 lines → split)
Mobile: list/chat as separate views, not side-by-side. Decompose into
`DMList.tsx`, `DMChat.tsx`, `MessageBubble.tsx`, `ChatInput.tsx`. E2EE
indicator as a subtle lock icon in the input placeholder, not a banner.

#### `ChatRoom.tsx` (shared bubble design)
Teal-gradient mine / `surface-3` theirs, slide-up entrance, avatar on
first message of a cluster, scroll-to-bottom button, skeleton loaders,
thin connection-status line at top. **Report/block controls from
Phase 0 live here — don't redesign this component without preserving
their visibility.**

#### `Settings.tsx`
Tabs: Account | Matchmaking | Appearance | Privacy. Privacy tab now
also surfaces the generic account-status indicator from Phase 0.

#### `GroupChat.tsx` (642 lines → split)
Cards with member count/last-active/avatar. Collapsible member sidebar
(desktop) / bottom sheet (mobile). Decompose into `GroupList.tsx`,
`GroupRoom.tsx`, `MemberPanel.tsx`.

#### `VideoChat.tsx` + `VideoRoom.tsx`
PiP self-view (draggable, rounded), floating control bar, connection
quality bars, full-screen toggle. **Same Phase-0 caveat as ChatRoom —
report/block must stay reachable in the redesigned control bar.**

---

## Phase 4.5 — User Testing Checkpoint (NEW — mandatory gate)

> [!IMPORTANT]
> This did not exist in v2 and is the second biggest gap from the
> review. Lighthouse/contrast/FPS numbers (Phase 7) tell you nothing
> about whether an actual 18–40-year-old finds the landing page copy
> genuine or cringe, or whether the report flow feels reassuring or
> alarming. Do not proceed to Phase 5/6/7 until this gate is cleared.

- Recruit 5 people in the 18–40 range (mix of genders, not all
  developer friends — that biases toward forgiving feedback).
- Screen-record each session: landing page first impression, signup/guest
  flow, first match, triggering the report button once on purpose,
  general navigation.
- Specifically ask: "Does this feel safe?" and "Did anything feel like
  it was trying too hard?" — the second question catches copy that
  reads as try-hard rather than relatable (a real risk flagged in the
  v2 review for lines like "Yeah, us too").
- Fix anything that gets a consistent negative reaction (3+ of 5) before
  Phase 5. Treat split or mild reactions as lower priority.
- This is informal and fast — budget 1–2 days, not a formal research
  study. The goal is catching obvious misses, not statistical rigor.

---

## Phase 5 — Sound Design & Micro-Interactions

### Sound defaults (changed from v2)

> [!IMPORTANT]
> **Sound is off by default, everywhere, for every user, until they
> explicitly opt in.** v2 relied on detecting OS silent mode, which only
> exists on mobile — desktop users would get sound blasted on their
> first message with no warning. This audience uses the product in
> public, at work, and next to sleeping partners more often than not;
> defaulting to on and hoping silent mode catches it is backwards.

- First time a sound *would* play, show a small one-time inline prompt:
  "Turn on sound effects?" with a toggle — not a modal, not blocking.
- If ignored/dismissed, stay off. No re-prompting.
- Global mute toggle in Settings → Appearance, defaults reflect the
  above.
- Once opted in, sounds persist via localStorage preference as before.

| Event | Sound Character | Duration | Haptic |
|---|---|---|---|
| Message sent | Soft upward whoosh | ~150ms | `vibrate(8)` |
| Message received | Gentle "plop" | ~200ms | `vibrate(12)` |
| Match found | Rising double-tone, warm | ~400ms | `vibrate([15,50,15])` |
| Match searching | Quiet ambient loop | Loop | None |
| Notification | Soft bell/chime | ~250ms | `vibrate(10)` |
| Error | Low muted "bonk" | ~150ms | `vibrate(20)` |
| Button click | Near-silent tap | ~50ms | `vibrate(5)` |

#### [NEW] `frontend/src/lib/sounds.ts` — `useSound()` hook,
`playSound(name)`, `setVolume()`, `setMuted()`, reads/writes the
opt-in preference described above (not just a mute toggle — an actual
off-by-default flag).

#### [NEW] `frontend/public/sounds/` — 48kHz WAV, ~5KB each.

### Micro-animations
(unchanged from v2 — send/receive bubble motion, match-found radar
merge, panel cross-fades, button press scale, sidebar toggle, notification
bell, online-dot color transition, typing dots, skeleton shimmer.) All
respect `prefers-reduced-motion: reduce`.

---

## Phase 6 — PWA: Installable Everywhere

#### [NEW] `frontend/public/manifest.json` — name, icons, shortcuts to
`/app/text-chat` and `/app/dms`, theme color `#14b8a6`.

#### [NEW] `frontend/public/sw.js`
App shell caching, offline fallback page, push notification support.

> [!WARNING]
> **Background sync for offline-sent messages is underspecified and is
> the riskiest item in this entire plan.** Don't treat it as a one-line
> bullet. At minimum, decide and document before building:
> - What happens if a queued offline message's conversation received
>   *other* messages from the server while offline — does the queued
>   message get inserted at the correct chronological position, or
>   appended at sync time (wrong order)?
> - What's the retry/backoff if the queued message fails to send after
>   reconnecting (e.g., recipient blocked the sender while offline)?
> - Is there a user-visible "pending" state on the message bubble before
>   confirmed sync, and what does failure look like in that bubble?
> If these aren't answered with confidence, ship Phase 6 *without*
> background sync first (cache-only offline fallback page is still a
> real, safe win) and treat sync as a fast-follow, not a blocker for
> the rest of Phase 6.

#### [MODIFY] `index.html` — manifest link, theme-color, apple-mobile-web-app-capable,
touch icons, og:tags, title, SW registration, preconnect hints.

#### [MODIFY] `vite.config.ts` — `vite-plugin-pwa`.

---

## Phase 7 — Performance, Accessibility & Code Quality

**Skeleton loaders:** DM list, message history, group list, search
results, profile loading.

**Virtual scrolling:** message lists 100+ messages, visible + 20-buffer,
scroll position preservation.

**Optimistic UI:** send-message "sending" state with WS ack confirm,
instant friend-request button update, instant match-cancel.

**Code splitting:** settings/group-chat/video chunks, lazy-loaded.

**Accessibility:** aria-label/role/tabindex everywhere, modal focus
trap, keyboard nav, `prefers-reduced-motion`, 4.5:1 contrast minimum,
screen-reader announcements for new message/match/notification.

**SEO:** per-route title/description, OG/Twitter cards, semantic HTML,
single h1, JSON-LD on landing page.

**Kill inline styles:** Tailwind + CSS custom properties throughout.
Dashboard 395→~120 lines, DMs 594→~150 lines (across split files),
GroupChat 642→~180 lines (across split files).

**Shared component library:** `<Avatar>`, `<Button>`, `<Input>`,
`<Modal>`, `<Badge>`, `<Skeleton>`, `<Toast>`, `<EmptyState>`.

---

## Implementation Order

| Phase | What | Est. Effort | Priority |
|---|---|---|---|
| **Phase 0** | In-call/in-chat safety UX | 1–2 days | 🔴 Trust foundation — ships first |
| **Phase 1** | Color System + Design Tokens | 1 day | 🔴 Everything depends on this |
| **Phase 2** | Responsive Layout | 2–3 days | 🔴 Biggest UX improvement |
| **Phase 3** | Icon System | 1–2 days (parallel with Phase 2 OK) | 🟡 Brand differentiator |
| **Phase 4** | Page-by-Page Redesign | 4–5 days | 🟡 Visible polish |
| **Phase 4.5** | User testing checkpoint | 1–2 days | 🔴 Mandatory gate, not optional |
| **Phase 5** | Sound + Animations | 1–2 days | 🟡 Makes it feel alive |
| **Phase 6** | PWA (without bg sync first) | 1 day | 🟢 Cross-platform reach |
| **Phase 7** | Performance + A11y + Code Quality | 3–4 days | 🟢 Foundation for scale |

**Total estimated: 16–22 days.** (Revised up from v2's 13–18; see open
decision on solo-build realism below — the original estimate assumed
no revision cycles, which Phase 4.5 explicitly introduces.)

---

## Verification Plan

### Automated
```bash
cd frontend && npm run build
npx tsc --noEmit
npm run lint
```

### Manual
- Lighthouse 90+ Performance/Accessibility/Best Practices/SEO.
- PWA installability: Chrome Android, Safari iOS, Chrome Desktop.
- Responsive: 375 / 390 / 768 / 1024 / 1440px.
- 60fps animations (Chrome DevTools Performance panel).
- Offline: cached shell loads with Network → Offline.
- Cross-browser: Chrome, Firefox, Safari, Edge.
- axe-core audit, VoiceOver/NVDA pass.
- Sound: verify true off-by-default on a fresh profile, verify opt-in
  prompt appears exactly once, verify it doesn't re-prompt after dismiss.
- Contrast: full palette through WebAIM checker.
- **Phase 0 specific:** report button reachable within 1 tap from both
  ChatRoom and VideoRoom with no scrolling, at 375px width; post-report
  flow auto-advances without a dead-end screen; pre-match notice shows
  exactly once per session.
- **Phase 4.5 specific:** all 5 test sessions reviewed, any 3+/5 negative
  reaction documented and either fixed or explicitly deferred with a
  written reason before Phase 5 starts.

---

## Appendix — Open Decisions & Suggestions for Whoever Builds This

These are points that need a human (product) decision, a design
exploration, or a judgment call that this plan deliberately leaves open
rather than guessing. If an AI agent (e.g. Antigravity) is executing
this plan, treat each of these as a place to either ask the user a
clarifying question before generating code, or to make a documented
assumption and flag it clearly in the PR/commit description rather than
silently picking one.

1. **Age verification.** Nothing in this plan adds an age gate. Given
   the product allows random video matching, decide explicitly whether
   self-attestation (a checkbox) is sufficient or whether something
   stronger is needed, and whether that's a legal requirement in any
   target jurisdiction. This is a product/legal decision, not something
   to default silently during implementation.

2. **Accent hue lock-in.** Flagged in Phase 1 — the teal/coral choice is
   sound as a *system* but only provisional as a *hue*. Before treating
   the palette as final, consider generating 2-3 alternate hue pairs
   using the exact same surface/spacing/radius tokens (e.g. warm
   amber-gold + deep plum, or desaturated rose + sage) and viewing them
   side-by-side on one real screen (ChatRoom or Home) rather than as
   swatches, since palettes read very differently in swatch form versus
   applied to real UI density.

3. **Report-flow content moderation depth.** Phase 0 specifies a
   one-line reason via bottom sheet. Decide whether that's a free-text
   field or a fixed set of reason categories (faster to act on, easier
   to analyze in aggregate, but less expressive for the reporter) before
   building the form — this changes the backend payload shape.

4. **Shadowban-surface wording.** Phase 0 suggests a deliberately vague
   "your account is under review" message so users can't easily learn
   to evade detection. Have an actual support/policy person sanity-check
   this wording before shipping — vague-but-honest is a narrow line to
   walk and the exact phrasing matters more than most copy in this plan.

5. **Background sync scope (Phase 6).** Explicitly decide whether to
   ship offline message queuing in this round at all, or defer it
   entirely to a follow-up phase once the ordering/retry/failure-UI
   questions in Phase 6's warning box have real answers. Shipping the
   cache-only offline fallback without sync is a legitimate, safer
   subset — don't feel obligated to do all of Phase 6 at once.

6. **Solo-build timeline realism.** If one person (not a team) is
   executing this across Phases 0–7, budget closer to 25–30 days once
   first-pass-then-revise cycles are counted, particularly around
   Phase 4's nine page rewrites and Phase 4.5's revision pass. Treat the
   16–22 day estimate as the no-surprises floor, not the expected case.

7. **Landing page copy tone-check.** Phase 4.5 exists partly because
   lines like "Yeah, us too" can land as relatable or as try-hard
   depending on delivery details (font weight, surrounding whitespace,
   whether it's animated in too cutely) that are impossible to judge
   from markdown alone. Don't skip the user-testing checkpoint for this
   page specifically, even under time pressure — it's the highest-risk
   copy in the whole plan precisely because it's trying to sound
   unscripted.

8. **Icon system fallback.** If custom SVG icon production (Phase 3a)
   turns out to be slower than estimated, have a documented fallback:
   ship Phase 4 with Lucide-only (no duotone fill) rather than blocking
   the page redesign on icon completion. The duotone treatment can be
   retrofitted onto existing Lucide icon usage later without touching
   page layout code, so it's safe to decouple if the timeline slips.

9. **PWA push notifications.** Phase 6 mentions push notification
   support for match-found/new-DM in one line but this requires a
   decision on a push provider (web-push with VAPID keys, or a third
   party) and backend work to store/manage subscription endpoints that
   isn't scoped anywhere in this plan. Either scope it properly as its
   own phase or explicitly cut it from this round.
