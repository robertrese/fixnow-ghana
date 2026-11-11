# Staff screens: inventory before the redesign (step 6)

Taken on 11 November 2026 from the local demo server, signed in as each demo role. Screenshots:
`work/qa/screenshots/staff/light/` (made by `node work/qa/staff-inventory.js`) and the summary
`work/qa/screenshots/summary/10-staff-inventory-now.png`. All data shown is demo data.

## How staff get in today

Profile > Verified staff access > "Verified responder sign in" dialog (server URL, username, password).
Every role then lands on one shared screen, "Responder field portal". There is no separate moderator
or admin screen, and no tab bar or sidebar entry for staff work.

## What each role sees

| Role (demo login) | Scope | What the screen shows | What works |
| --- | --- | --- | --- |
| Moderator (`moderator`) | National | Role card, four queue buttons (Assigned, Institutional, Overdue, Escalated), search, category and status filters, List/Map | Nothing to moderate: the default "Assigned" queue is empty and there is no "waiting for moderation" queue |
| District Assembly (`assembly`) | Accra Metropolitan | Same, plus one case card | Update status, Add evidence, Escalate, Routing, view private photo, case history |
| NADMO (`nadmo`) | Its own area | Same, empty | Same as Assembly when it has cases |
| Utility (`utility`) | Its own area | Same, empty | Same as Assembly when it has cases |
| Admin (`admin`) | National | Same, plus "Administration and routing" | Add configuration, Add routing rule, Invite responder, Readiness, Retention check, four counts |

## What the server already supports (and the app does not show)

- **Moderation** (`POST /api/reports/:id/moderation`): approve (needs a note and a safe public
  location), reject, flag, hide, escalate. No screen in the portal calls approve or reject. The older
  "command centre" code that had flag and hide buttons is not reachable.
- **Photo review**: approve or withdraw a public photo with the privacy check, already inside the
  private photo preview, but only reachable from a case card a moderator never sees.
- **Staff accounts** (`GET/POST /api/users`, `PATCH /api/users/:id`): no screen.
- **Audit log** (`GET /api/audit`): no screen.
- **Onboarding requests** (approve or reject): no screen.
- **Assign and accept**: buttons exist in code (`Accept`, `Assign`/`Reassign`) and appear only in
  some states.

## Problems against the brief and the V3 design rules

1. No moderator queue: reports waiting for verification cannot be found, verified or rejected.
2. Reject has no reason field (the server accepts a note but does not require one).
3. No public preview before publishing, so a moderator cannot see what residents will see.
4. Case cards join text with " - " (for example "FN-… - Flooding or drainage", "drain.jpg - clean",
   "version 1 - priority"); the brief forbids dot-joined meta text and this is the same pattern.
5. Raw values shown to people: "Resolution: not-provided", "SLA 11/10/2026, 12:38:46 PM".
6. The page title "Responder field portal" appears twice, and the laptop sidebar is empty for staff.
7. The full exact location is printed on every case card in the list, rather than on the case page.
8. Admin buttons are a long stack of equal-weight buttons with no sections; staff accounts and the
   audit log are missing.
9. Small type (around 11 to 12 px) in role cards, tags and filter labels.
10. No case page: everything is crammed into the list card.

## Plan for the redesign

- One **Staff** area with its own navigation (tabs on phones, the sidebar on laptops), shown only to
  signed-in staff, with Sign out always visible.
- **Moderator:** "Waiting for review" queue (new reports not yet verified or rejected) with counts
  from the server; a review page with the report, private photo review, a public preview, Verify
  (privacy confirmation and note required) and Reject (reason required).
- **Responders (Assembly, NADMO, Utility):** cases in their own area with queue filters; a case page
  with the exact location, Accept, status change (only allowed transitions), a public update and a
  private internal note, kept apart.
- **Admin:** Routing, Staff accounts (list, add, deactivate), Audit log (newest first, IP addresses
  only as hashes except sign-in attempts), and the existing configuration tools.
- Real numbers only (counts come from the server), no " - " joins, no ALL CAPS, 44 px targets,
  keyboard use, phone and laptop, light and dark, 0 axe violations.

## After the redesign (step 6, 11 November 2026)

The staff area is now its own page, `outputs/staff.html` (with `staff.js` and `staff.css`). Resident pages no
longer contain any staff code, staff sign-in form or cached staff cases; "Verified staff access" opens the staff
page. This also took the resident page from about 113 KB to about 75 KB compressed.

| Role | Tabs | What they can do |
| --- | --- | --- |
| Moderator | Review, Cases | Review queue (immediate danger and Critical first, then longest waiting, with waiting time); review page with the report, private details, photos, a public preview and the office the routing rules would choose; Verify and publish (privacy confirmation and note), Reject, Escalate, Hide (each needs a reason); photo check and publishing |
| Assembly, NADMO, Utility | Cases | Cases in their own area with In my area, Assigned to me, Overdue and Escalated lists, search, type and status filters; case page with Accept, Post an update (allowed next statuses, public update, internal note, resolution proof), Escalate, Add a field photo, Routing |
| Admin | Review, Cases, Routing, Staff, Audit log | Everything a moderator can do, plus routing rules and offices, readiness and retention checks, staff accounts (add, turn off, turn on, invite with a code), the audit log with filters, and recording real delivery outcomes |

Privacy rules now enforced by the server, with tests in `work/fixnow-backend/test-api.js`:

- Staff lists never include contact details or exact coordinates (`responderListReport`).
- The case page (`GET /api/reports/:id/case`) shows the exact location to staff whose area covers the report, and
  contact details only to moderators, admins and the responder the case is assigned to. Every opening is audited.
- Reject and Hide need a reason; Verify needs the privacy confirmation and a note.
- Only moderators and admins can open the review queue.

Not done yet: the responder map view from the old portal is not in the new staff area (cases are a list only), and
case pages need a connection because private details are never stored on the phone. Status updates posted offline
are kept on the phone, labelled "Not sent yet", and sent when the connection returns.

## Office routing rule (12 November 2026)

- Responders see a report only after a moderator has verified or escalated it, and only if the routing rules send it
  to their own office (or it is assigned to them). Reports waiting for review stay with moderators and admins.
- Verifying or escalating records the routing straight away, so the office sees the case in the same moment.
- A released report that no rule matches is seen only by moderators and admins, marked "No office can see this".
- Demo routing (local demo data only): flooding to NADMO, water and electricity to the utility desk, waste and roads to
  the assembly, anything else in Accra Metropolitan to the assembly.
