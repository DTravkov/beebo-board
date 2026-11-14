# Manual review checklist

Start with `npm ci`, `npm run check`, and `npm run dev`. Open `http://127.0.0.1:5173`. Use synthetic content; this is an implementation review, not a classroom production launch.

## Local board

- Draw freehand, rectangles in both directions, ellipses, and arrows. Add multiline text and notes. Select/move objects, erase, undo, and redo.
- Move every element type with Cursor (V), including outlined shapes by their interiors. Paste a large screenshot and a photo file (Ctrl/⌘ V, and drag-and-drop); check they are shrunk, resize by corners only, add a description, copy one back out with Ctrl/⌘ C and paste it again, and confirm a shared room receives them. Draw a Frame (F), drop a note and a line inside, change its background, drag it (contents follow), and export it as PNG. Click with Text (T), type, and click away; check the box hugs the text. Change font, size, bold, and alignment from the toolbar; resize with corner handles (scales text) and side handles (rewraps text); double-click to edit again. Hold and drag Object eraser (E, in the Pen flyout) across several objects, including overlapping objects; verify it stops on release and works after zoom/pan.
- Pan with the Hand tool or middle-mouse drag; verify middle dragging over an object pans without moving or erasing it. Space is no longer a pan shortcut. Zoom with the wheel and controls; fit the board. Repeat Hand-tool panning with touch/pen input on a target device.
- Open Objects and perform tasks without canvas dragging: add a note, edit text/coordinates/color/size, delete, and undo. Check keyboard shortcuts, focus visibility, modal Escape behavior, and focus return.
- Export JSON, open it again, and compare title, text, positions, colors, and order. Import malformed/oversized files and confirm the existing board survives.
- Export PNG and confirm it captures the visible view. A PNG is not an editable backup.
- Enable personal saving, edit, reload, and explicitly restore. Disable it, forget the saved board, then confirm restore finds nothing. Repeat in a shared-device/private-browser scenario and test storage failure handling.
- Try both learning templates. Inspect desktop, narrow/mobile, zoomed text, reduced motion, and screen-reader output.

## Collaboration

- Without TURN configuration, verify Relay only is selected and room creation stays disabled. Direct mode should be unavailable unless the operator enables it.
- For an explicit direct-mode evaluation, enable it in `.env`, restart, create a room choosing direct connections, and join from a second browser profile using the complete invitation.
- Edit different objects, and different properties of one object, simultaneously. Move one note while another participant edits its text. Verify convergence. Check local undo does not undo another person's independent work.
- Late-join another browser; verify no duplicate welcome template is introduced. Reload a joining browser, explicitly rejoin, and verify an online peer restores the board.
- Test cursors, low-bandwidth mode, a slow/disconnected participant, and leaving/rejoining. Reload/rejoin is required; automatic recovery is not claimed.
- Admit eight participants, then verify the ninth is rejected. Test expired, malformed, and wrong-secret invitations.
- Export before closing everyone. Confirm the documentation accurately explains that a new room or restart has no server-side board recovery.
- Treat every participant as a full editor. Teacher-only roles and revocation are not implemented; do not infer them from the private-room label.

## Live TURN validation — requires operator infrastructure

- Configure coturn with a shared secret, valid TLS endpoint, quotas, relay ports, and network restrictions. Configure `TURN_URLS`, `TURN_SECRET`, and exact `PUBLIC_ORIGIN`.
- Create a default relay-only room and inspect selected ICE candidate pairs using browser WebRTC diagnostics or `RTCPeerConnection.getStats()`. Confirm successful paths use relay candidates.
- Test from separate networks and a network with UDP blocked; evaluate TURN/TCP/TLS. Block/unconfigure TURN and confirm no silent direct fallback occurs.
- Verify temporary credentials expire, do not expose the operator secret, and document current refresh limitations. Test session expiry and operator restart behavior.
- Measure eight-person relay bandwidth, startup time, latency, and CPU/memory under realistic concurrent drawing. Test constrained bandwidth, 200 ms latency, and packet loss; publish measured limits rather than assumptions.

The automated browser smoke test uses explicit direct mode and an existing local browser. It validates encrypted application synchronization, not a real TURN deployment. Security/credential tests use synthetic relay configuration.

## Repository and compliance

- Review `CONTRIBUTING.md`, `AGENTS.md`, license policy/evidence, and the SBOM/notices diff.
- Confirm no secrets, real learner data, analytics, public signaling defaults, remote fonts, or downloaded browser binaries were added.
- Review DPG gaps, formal ownership, private reporting channels, and applicable operator responsibilities.
- Configure remote branch protection and required checks before merging the foundation PR. No remote settings or publication are implied by this local work.
