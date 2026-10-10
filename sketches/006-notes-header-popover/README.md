# 006 — Notes: Header Popover

**Stance:** a "📝 Trip Notes" pill in the header row (with pinned-count badge).
Click opens a popover anchored under it with the note list; "＋ Add" and
"Open full notes board →" (the separate /notes route) live inside the popover.

- Lightest footprint: one small pill in the header, zero vertical space.
- Best match for "expandable in the header area" without touching page layout.
- Close on outside click; 2-line clamped bodies keep it compact.
- Tradeoff: popover is small — on mobile it's cramped, and it can only preview;
  real reading/writing still goes to the full board route.
