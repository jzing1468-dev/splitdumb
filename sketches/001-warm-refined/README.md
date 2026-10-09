# Variant: Warm Refined

## Design stance
Keep the current warm "Apple × Notion" identity and single-column feel — just execute it properly: bottom tabs and sticky add button on mobile, two-pane sidebar on desktop.

## Key choices
- Layout: mobile single column + fixed bottom tab bar + floating "+ Add expense" pill; ≥1024px becomes a 320px sticky sidebar (balances + suggested payments) beside content
- Mobile hero: "You are owed +$71.98" with per-person chips (your chip ringed)
- Typography: current SF/Inter stack, unchanged
- Color: current palette unchanged (Notion blue accent, warm grays)
- Interaction: expandable expense rows, segmented tab control, amber pending badge

## Trade-offs
- Strong at: lowest migration cost, familiar to current users, mobile ergonomics
- Weak at: still a "pretty expense app", not distinctive; sidebar cards add chrome on desktop

## Best for
Incremental modernization without retraining users — this is "the current app, done right."
