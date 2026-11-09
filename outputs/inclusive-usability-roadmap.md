# FixNow Ghana Inclusive Usability Roadmap

Generated: June 14, 2026

## Honest Answer

The current app is much stronger than a prototype, but it is not the best possible version yet. A truly inclusive app for people aged 16 to 80, men and women, different literacy levels, different languages, and different disabilities requires design, engineering, and real-world testing.

The current build already includes:

- Plain-language guidance
- English, Twi, Ga, Ewe, and Hausa help text
- Dagbani and Fante starter help text
- Large text mode
- High contrast mode
- Simple mode
- Field mode for shortest on-phone reporting
- One-handed layout mode
- Read-aloud help
- Keyboard focus styles
- Step-by-step guided report path
- Quick problem buttons beside the problem selector
- Pictorial/text examples of good reports
- Helper contact field, call helper link, and copy-helper message
- SMS template sharing mode
- Share confirmation before opening WhatsApp or SMS
- Exact-location protection on public queue cards by default
- Non-color severity labels on queue score badges
- Visual action log for confirmation after actions
- Consent flows
- Optional GPS and photo use
- Offline storage
- Export and delete data
- UGC moderation controls

## What To Add Next For Much Better Inclusion

### Vision Disabilities

- Full screen-reader audit with TalkBack and VoiceOver.
- Proper labels for every control in the native wrappers.
- Dynamic Type support in iOS and font scaling support in Android.
- Non-color-only severity indicators.
- Better high-contrast map and queue mode.

### Hearing Disabilities

- No audio-only instruction.
- Visual confirmation for every action.
- Captions/transcripts for future training videos.

### Motor Disabilities

- Larger tap targets across every action.
- Fewer tiny filters in field mode.
- Voice dictation-friendly form labels.
- One-handed mode for field reporting.
- Avoid drag-only or gesture-only interactions.

### Cognitive, Literacy, And Elder Users

- Step-by-step guided reporting mode.
- Icons beside problem types.
- Fewer fields in default mode, advanced fields hidden.
- Confirmation screen before sharing.
- “Call helper” and “send to trusted contact” flow.
- Pictorial examples of good reports.

### Language Inclusion

- Full interface translations, not only help text.
- Human review of Twi, Ga, Ewe, Hausa, Dagbani, Fante, and other priority languages.
- Local voice prompts where possible.
- Avoid government/technical words where plain words work.

### Low Connectivity And Low-End Phones

- Keep the app under a small install size.
- Make every core flow work offline.
- Add SMS template mode.
- Add sync retry when a backend exists.
- Test on older Android devices.

### Gender And Safety

- Anonymous mode remains important.
- Hide reporter identity by default in public views.
- Add domestic safety warning for reports involving violence or intimidation.
- Avoid exposing exact location for sensitive reports unless needed by responders.

## Real-World Test Plan

Before calling it “for everyone,” test with:

- Teen users, working adults, elderly users.
- Market traders, drivers, students, health workers, assembly staff, volunteers.
- Low-vision users.
- Blind screen-reader users.
- Users with limited mobility.
- Users with low literacy.
- Users on low-end Android phones.
- Users in at least three Ghana regions.

Target: each user should be able to create a useful report in under two minutes without training.
