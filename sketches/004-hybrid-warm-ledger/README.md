# Variant: Warm Ledger (hybrid of 001 + 003)

## Design stance
001's warm light identity and layout as the base; 003's money-forward hierarchy grafted in — the balance hero, monospace numerals, settlement progress, people cards, and pending pill, all re-skinned in the warm palette.

## What came from 001
- Entire warm light palette, type stack, radii, shadows
- Single-column mobile + bottom tab bar + safe-area padding
- Desktop two-pane layout with sticky sidebar
- Segmented tab control, expandable expense rows, Venmo pay pills

## What came from 003
- **Hero balance card**: big mono "You are owed +$71.98", "of $415.00 total", settlement progress bar (34% settled / $170 outstanding), green "Settle up →" CTA
- **Monospace tabular numerals** for every amount (hero, balances, debt rows, expense rows)
- **Pending pill** (amber) on debt rows and history
- **People mini-cards** with initial avatars instead of bare text chips
- Signed amounts (−56.67) on debt rows instead of plain $56.67

## Desktop composition
Hero + people stack lives in the sticky sidebar, so "what am I owed" is always on screen while scrolling expenses — the answer to the app's core question never scrolls away.

## Trade-offs
- Strong at: keeps current users at home, upgrades the money story, dark mode later is one token block
- Weak at: slightly busier top of page than 001 (hero before content)
