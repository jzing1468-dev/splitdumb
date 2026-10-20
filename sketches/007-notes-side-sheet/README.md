# 007 — Notes: Side Sheet Drawer

**Stance:** header has a compact "📝 Trip Notes" button plus an always-visible
one-line pinned preview ("📌 Campsite… 5 notes →"). Clicking slides in a side
sheet (right drawer; full-width on mobile) with the complete notes board.

- Separate-space feel is strongest: the notes board is its own overlay surface,
  never reshuffles the expense page. Directly previews both collapsed (preview
  line) and expanded (drawer).
- The drawer is the widest reading surface of the three; the Add-note button,
  cards, and future edit affordances all fit naturally.
- Tradeoff: most code of the three (scrim + drawer + focus handling), and the
  drawer pattern needs care on mobile (currently full-width sheet).
- **Implemented variant differs from this sketch** (post-review rework): the
  sheet is 560px on desktop (420px was too narrow for prose), textareas
  auto-grow (min 96px) instead of a fixed 4-row box, body text is 0.9rem/1.6,
  cards are larger-radius with more padding, and the notes pill lives in a
  strip under the title with the pinned preview rather than in the header
  action row.
