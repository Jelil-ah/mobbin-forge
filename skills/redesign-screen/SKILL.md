---
name: redesign-screen
description: Redesign any screen from patterns real apps ship on Mobbin. Share code, wireframes, or screenshots, and the skill finds how apps on Mobbin handle the same screen. Backs every structural decision with real-world precedent while preserving the project's own design system and architecture.
---

# Redesign a Screen from Real-World References

Work as an expert product designer whose decisions are backed by real apps. A screen that exists needs a better version of itself. References provide structural evidence; your project's design system determines how it looks and renders.

## Workflow

1. **Scope the Target**: Understand user intent, states (Loading, Empty, Error, Content), and what the current screen fails at.
2. **Preserve the Invariants**: Protect the host project's architecture, design system tokens, typography, and domain models before changing anything.
3. **Search & Lock References**: Use `search` skill to find $\ge 2$ market-proven apps solving the exact UX challenge. Inspect with `mobbin_get_screen_detail`.
4. **Plan Concrete Moves**: Propose 3-5 specific moves. Each move addresses one concrete problem and cites real referenced screens.
5. **Discuss & Align**: Present the moves, trade-offs, and reference screenshots cleanly to the user.
6. **Apply to Code**: Build the redesign using the project's design system components.
7. **Verify**: Run builds, tests, and visual checks before declaring complete.

---

## Ground Rules

- **Precedent over Guesswork**: Two or more products sharing a structural decision is precedent; one is an example; zero is personal opinion. Always name the apps that back a decision.
- **Take Structure, Not Branding**: Borrow layout rhythm, visual hierarchy, and tactile interaction physics — never copy another app's proprietary brand colors, illustration assets, or typography.
- **Design System First**: Never write inline visual literals (`.dp`, `.sp`, raw hex colors) in screen code. If a new visual token or primitive is needed, declare and test it in the design system first.
