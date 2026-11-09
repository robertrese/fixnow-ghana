# FixNow Ghana Figma Redesign Handoff

Created: August 13, 2026

Figma file: https://www.figma.com/design/966c69YLRQkHPznlDQOHfW

## Editable Current-App References

- Home: https://www.figma.com/design/966c69YLRQkHPznlDQOHfW?node-id=1-2
- Nearby: https://www.figma.com/design/966c69YLRQkHPznlDQOHfW?node-id=2-2
- Report: https://www.figma.com/design/966c69YLRQkHPznlDQOHfW?node-id=3-2
- My Reports: https://www.figma.com/design/966c69YLRQkHPznlDQOHfW?node-id=4-2
- Profile: https://www.figma.com/design/966c69YLRQkHPznlDQOHfW?node-id=5-2

## Proposed Mobile Redesign

The page `02 Proposed mobile redesign` contains:

- Home: node `7:17`
- Nearby: node `7:89`
- Report: node `7:167`
- My Reports: node `7:245`
- Profile: node `7:330`
- UI foundation: node `7:420`

## Direction

- Quiet public-service layout with one clear action per screen
- Fewer floating cards and decorative panels
- Real report references, locations, timestamps, and delivery states
- Consistent 390 x 844 mobile frames and bottom navigation
- 48px primary controls, high-contrast text, and word-based status labels
- Ghana identity carried through restrained red, gold, and green details
- Private data kept out of public map and nearby-report concepts
- Flat colour, 8px content corners, no gradients, and restrained shadow use

The HTML app now supports `?view=home`, `?view=nearby`, `?view=report`, `?view=my`, and `?view=profile` for reproducible design review links. Normal app navigation is unchanged.

## Reference-Led Build Update

The August 13 citizen build now applies the proposed direction in the working app:

- Home uses a single dominant report action, six common issue choices, emergency-first help, and a nearby preview.
- Report begins with problem selection, followed by optional photo, location, impact, privacy, and review.
- Nearby uses category feeds, map/list controls, a focused mobile result sheet, and community confirmation.
- My Reports shows clear four-stage progress and opens a Submitted / Under review / Assigned / Resolved timeline.
- Profile now contains optional account access, privacy, local-data controls, language, accessibility, and the 112 emergency action.
- First use has a branded, plain-language welcome while retaining explicit privacy, conduct, and emergency consent.
