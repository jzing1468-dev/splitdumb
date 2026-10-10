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
